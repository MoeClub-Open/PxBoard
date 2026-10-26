package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"net/http"
	"slices"
	"strings"
)

func (s *Server) importRuntime(w http.ResponseWriter, r *http.Request, actor p.Actor, path string) {
	parts := strings.Split(path, "/")
	if len(parts) != 2 || r.Method != "POST" {
		p.Fail(w, 404, "导入接口不存在")
		return
	}
	id, operation := parts[0], parts[1]
	installed, e := s.Plugins.Get(actor.Plugin)
	if bad(w, e) {
		return
	}
	allowed := installed.Permissions
	has := func(namespace string) bool { return slices.Contains(allowed, "import:"+namespace) }
	if !slices.Contains(allowed, "import:users") {
		forbidden(w, "插件没有数据迁移权限")
		return
	}
	if operation == "begin" {
		var metadata p.Record
		if bad(w, p.Decode(r, &metadata)) {
			return
		}
		raw, _ := json.Marshal(metadata)
		_, e = s.Store.DB.Exec("INSERT INTO import_runs(id,owner,status,metadata,created_at)VALUES(?,?,'staging',?,?) ON CONFLICT(id)DO NOTHING", id, actor.Plugin, string(raw), store.Now())
		if bad(w, e) {
			return
		}
	}
	var owner, status string
	if e = s.Store.DB.QueryRow("SELECT owner,status FROM import_runs WHERE id=?", id).Scan(&owner, &status); e != nil {
		p.Fail(w, 404, "导入任务不存在")
		return
	}
	if owner != actor.Plugin {
		forbidden(w, "任务不属于此插件")
		return
	}
	if operation == "begin" || status == "committed" {
		p.JSON(w, p.ImportReport{ID: id, Status: status})
		return
	}
	if operation == "stage" {
		var batch struct {
			Rows []p.ImportRow `json:"rows"`
		}
		if bad(w, p.Decode(r, &batch)) {
			return
		}
		tx, e := s.Store.DB.Begin()
		if bad(w, e) {
			return
		}
		defer tx.Rollback()
		for _, row := range batch.Rows {
			namespace := row.Namespace
			if row.Kind == "user" {
				namespace = "users"
			} else if row.Kind != "document" {
				p.Fail(w, 400, "导入记录类型无效")
				return
			}
			if !has(namespace) {
				forbidden(w, "未获目标数据写入权限："+namespace)
				return
			}
			if row.ID == "" || !json.Valid(row.Data) {
				p.Fail(w, 400, "导入记录缺少标识或格式无效")
				return
			}
			var prior string
			e = tx.QueryRow("SELECT data FROM import_rows WHERE run_id=? AND kind=? AND namespace=? AND collection=? AND id=?", id, row.Kind, row.Namespace, row.Collection, row.ID).Scan(&prior)
			if e != nil && e != sql.ErrNoRows {
				bad(w, e)
				return
			}
			if e == nil && prior != string(row.Data) {
				p.Fail(w, 409, "相同任务的源记录已变化，请创建新的导入任务")
				return
			}
			_, e = tx.Exec("INSERT OR IGNORE INTO import_rows VALUES(?,?,?,?,?,?)", id, row.Kind, row.Namespace, row.Collection, row.ID, string(row.Data))
			if bad(w, e) {
				return
			}
		}
		if !bad(w, tx.Commit()) {
			p.JSON(w, true)
		}
		return
	}
	if operation != "check" && operation != "commit" {
		p.Fail(w, 404, "导入操作不存在")
		return
	}
	all, e := s.Plugins.List()
	if bad(w, e) {
		return
	}
	enabled := map[string]bool{}
	for _, plugin := range all {
		enabled[plugin.ID] = plugin.Enabled && plugin.Error == ""
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	report, e := checkImport(tx, id, has, enabled)
	if bad(w, e) {
		return
	}
	if len(report.Errors) > 0 || operation == "check" {
		p.JSON(w, report)
		return
	}
	rows, e := tx.Query("SELECT kind,namespace,collection,id,data FROM import_rows WHERE run_id=? ORDER BY CASE kind WHEN 'user' THEN 0 ELSE 1 END", id)
	if bad(w, e) {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var kind, namespace, collection, recordID, raw string
		if e = rows.Scan(&kind, &namespace, &collection, &recordID, &raw); e != nil {
			bad(w, e)
			return
		}
		if kind == "user" {
			var user p.ImportUser
			_ = json.Unmarshal([]byte(raw), &user)
			_, e = tx.Exec("INSERT INTO users VALUES(?,?,?,?,?,?,?)", user.ID, strings.ToLower(user.Email), user.Name, user.Password, user.Role, user.Status, user.CreatedAt)
			if e == nil {
				_, e = tx.Exec("INSERT INTO user_credentials VALUES(?,?,?,?)", user.ID, user.PasswordAlgorithm, user.PasswordSalt, user.MFASecret)
			}
		} else {
			var record p.Record
			decoder := json.NewDecoder(strings.NewReader(raw))
			decoder.UseNumber()
			if bad(w, decoder.Decode(&record)) {
				return
			}
			record["id"] = recordID
			payload, _ := json.Marshal(record)
			_, e = tx.Exec("INSERT INTO documents VALUES(?,?,?,?,?)", namespace, collection, recordID, string(payload), store.Now())
		}
		if bad(w, e) {
			return
		}
	}
	if bad(w, rows.Err()) {
		return
	}
	rows.Close()
	_, e = tx.Exec("UPDATE import_runs SET status='committed',committed_at=? WHERE id=?", store.Now(), id)
	if bad(w, e) {
		return
	}
	if bad(w, tx.Commit()) {
		return
	}
	s.Store.Log(actor.Plugin, "migration.commit", id)
	report.Status = "committed"
	p.JSON(w, report)
}
func checkImport(tx *sql.Tx, id string, has func(string) bool, enabled map[string]bool) (p.ImportReport, error) {
	report := p.ImportReport{ID: id, Status: "ready", Errors: []string{}}
	var metadata string
	if e := tx.QueryRow("SELECT metadata FROM import_runs WHERE id=?", id).Scan(&metadata); e != nil {
		return report, e
	}
	var expected struct {
		Rows int `json:"expectedRows"`
	}
	if e := json.Unmarshal([]byte(metadata), &expected); e != nil {
		return report, e
	}
	rows, e := tx.Query("SELECT kind,namespace,collection,id,data FROM import_rows WHERE run_id=?", id)
	if e != nil {
		return report, e
	}
	defer rows.Close()
	emails := map[string]bool{}
	numericIDs := map[string]bool{}
	uniqueValues := map[string]bool{}
	for rows.Next() {
		report.Rows++
		var kind, namespace, collection, key, raw string
		if e = rows.Scan(&kind, &namespace, &collection, &key, &raw); e != nil {
			return report, e
		}
		if kind == "user" {
			report.Users++
			var u p.ImportUser
			if e = json.Unmarshal([]byte(raw), &u); e != nil {
				return report, e
			}
			email := strings.ToLower(u.Email)
			if u.ID != key || !strings.Contains(email, "@") || u.Name == "" || u.CreatedAt == "" || !slices.Contains([]string{"member", "admin"}, u.Role) || !slices.Contains([]string{"active", "disabled"}, u.Status) {
				report.Errors = append(report.Errors, "用户记录无效："+key)
			}
			if e = validateCredential(u.Password, u.PasswordAlgorithm, u.MFASecret); e != nil {
				report.Errors = append(report.Errors, key+"："+e.Error())
			}
			if emails[email] {
				report.Errors = append(report.Errors, "源邮箱重复："+email)
			}
			emails[email] = true
			var n int
			if e = tx.QueryRow("SELECT COUNT(*) FROM users WHERE id=? OR lower(email)=?", u.ID, email).Scan(&n); e != nil {
				return report, e
			}
			if n > 0 {
				report.Errors = append(report.Errors, "目标已有相同用户标识或邮箱："+email)
			}
		} else {
			report.Documents++
			if !has(namespace) || !enabled[namespace] {
				report.Errors = append(report.Errors, "目标插件未启用或没有导入权限："+namespace)
			}
			var n int
			if e = tx.QueryRow("SELECT COUNT(*) FROM documents WHERE namespace=? AND collection=? AND id=?", namespace, collection, key).Scan(&n); e != nil {
				return report, e
			}
			if n > 0 {
				report.Errors = append(report.Errors, "目标记录已存在："+namespace+"/"+collection+"/"+key)
			}
			if namespace == "access" && collection == "accounts" || namespace == "subscriptions" && collection == "links" {
				var record p.Record
				if e = json.Unmarshal([]byte(raw), &record); e != nil {
					return report, e
				}
				user := p.Text(record, "userId")
				if e = tx.QueryRow("SELECT (SELECT COUNT(*) FROM users WHERE id=?)+(SELECT COUNT(*) FROM import_rows WHERE run_id=? AND kind='user' AND id=?)", user, id, user).Scan(&n); e != nil {
					return report, e
				}
				if n != 1 {
					report.Errors = append(report.Errors, "账户所属用户缺失："+key)
				}
				fields := []string{"userId", "credential"}
				if namespace == "subscriptions" {
					fields = []string{"token"}
				}
				for _, field := range fields {
					value := p.Text(record, field)
					uniqueKey := namespace + "/" + field + "/" + value
					if value == "" || uniqueValues[uniqueKey] {
						report.Errors = append(report.Errors, "连接凭据、订阅令牌或所属用户重复/缺失："+key+"/"+field)
					}
					uniqueValues[uniqueKey] = true
					if e = tx.QueryRow("SELECT COUNT(*) FROM documents WHERE namespace=? AND collection=? AND json_extract(data,?)=?", namespace, collection, "$."+field, value).Scan(&n); e != nil {
						return report, e
					}
					if n > 0 {
						report.Errors = append(report.Errors, "目标已有相同连接凭据、订阅令牌或访问账户："+key+"/"+field)
					}
				}
			}
			if (namespace == "access" && collection == "accounts") || (namespace == "nodes" && (collection == "nodes" || collection == "machines")) {
				var record p.Record
				_ = json.Unmarshal([]byte(raw), &record)
				field := "wireId"
				if collection == "accounts" {
					field = "numericId"
				} else if collection == "machines" {
					field = "number"
				}
				value := record[field]
				wireKey := fmt.Sprintf("%s/%s/%v", namespace, collection, value)
				if value == nil || numericIDs[wireKey] {
					report.Errors = append(report.Errors, "数字标识缺失或重复："+wireKey)
				}
				numericIDs[wireKey] = true
				if e = tx.QueryRow("SELECT COUNT(*) FROM documents WHERE namespace=? AND collection=? AND json_extract(data,?)=?", namespace, collection, "$."+field, value).Scan(&n); e != nil {
					return report, e
				}
				if n > 0 {
					report.Errors = append(report.Errors, "目标数字标识冲突："+wireKey)
				}
			}
		}
	}
	if report.Rows == 0 {
		report.Errors = append(report.Errors, "没有待导入记录")
	}
	if report.Rows != expected.Rows {
		report.Errors = append(report.Errors, fmt.Sprintf("暂存记录不完整：预计 %d，实际 %d", expected.Rows, report.Rows))
	}
	if len(report.Errors) > 0 {
		report.Status = "blocked"
	}
	return report, rows.Err()
}
