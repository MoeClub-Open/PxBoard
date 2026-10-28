package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"net/http"
	"slices"
	"strconv"
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
			} else if row.Kind == "setting" && row.ID == "adminPath" && row.Namespace == "" && row.Collection == "" {
				namespace = "settings"
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
	users, e := tx.Prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)")
	if bad(w, e) {
		return
	}
	defer users.Close()
	credentials, e := tx.Prepare("INSERT INTO user_credentials VALUES(?,?,?,?)")
	if bad(w, e) {
		return
	}
	defer credentials.Close()
	documents, e := tx.Prepare("INSERT INTO documents VALUES(?,?,?,?,?)")
	if bad(w, e) {
		return
	}
	defer documents.Close()
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
			_, e = users.Exec(user.ID, strings.ToLower(user.Email), user.Name, user.Password, user.Role, user.Status, user.CreatedAt)
			if e == nil {
				_, e = credentials.Exec(user.ID, user.PasswordAlgorithm, user.PasswordSalt, user.MFASecret)
			}
		} else if kind == "setting" {
			var value string
			_ = json.Unmarshal([]byte(raw), &value)
			_, e = tx.Exec("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", recordID, value)
		} else {
			var record p.Record
			decoder := json.NewDecoder(strings.NewReader(raw))
			decoder.UseNumber()
			if bad(w, decoder.Decode(&record)) {
				return
			}
			record["id"] = recordID
			payload, _ := json.Marshal(record)
			_, e = documents.Exec(namespace, collection, recordID, string(payload), store.Now())
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
	conflicts, e := loadImportConflicts(tx, id)
	if e != nil {
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
	adminPath := "/admin"
	_ = tx.QueryRow("SELECT value FROM settings WHERE key='adminPath'").Scan(&adminPath)
	if adminPath == "" {
		adminPath = "/admin"
	}
	var stagedAdmin string
	var stagedRaw string
	if tx.QueryRow("SELECT data FROM import_rows WHERE run_id=? AND kind='setting' AND id='adminPath'", id).Scan(&stagedRaw) == nil {
		_ = json.Unmarshal([]byte(stagedRaw), &stagedAdmin)
	}
	effectiveAdmin := adminPath
	if stagedAdmin != "" {
		effectiveAdmin = stagedAdmin
	}
	var existingRoute string
	if tx.QueryRow("SELECT data FROM documents WHERE namespace='subscriptions' AND collection='public_routes' AND id='primary'").Scan(&existingRoute) == nil {
		var route p.Record
		if json.Unmarshal([]byte(existingRoute), &route) == nil && p.Bool(route, "enabled") {
			paths, err := p.PublicRoutePaths(route)
			if err != nil || routeConflictsAdmin(paths, effectiveAdmin) {
				report.Errors = append(report.Errors, "后台入口与现有订阅路径冲突")
			}
		}
	}
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
			if conflicts.userIDs[u.ID] || conflicts.emails[email] {
				report.Errors = append(report.Errors, "目标已有相同用户标识或邮箱："+email)
			}
		} else if kind == "setting" {
			var value string
			if !has("settings") || key != "adminPath" || namespace != "" || collection != "" || json.Unmarshal([]byte(raw), &value) != nil || !validAdminPath(value) {
				report.Errors = append(report.Errors, "后台入口设置无效或没有导入权限")
			} else if adminPath != "/admin" && adminPath != value {
				report.Errors = append(report.Errors, "目标已有不同的后台入口，未覆盖")
			}
		} else {
			report.Documents++
			if !has(namespace) || !enabled[namespace] {
				report.Errors = append(report.Errors, "目标插件未启用或没有导入权限："+namespace)
			}
			if conflicts.documents[importDocumentKey{namespace, collection, key}] {
				report.Errors = append(report.Errors, "目标记录已存在："+namespace+"/"+collection+"/"+key)
			}
			if namespace == "subscriptions" && collection == "public_routes" {
				var route p.Record
				if json.Unmarshal([]byte(raw), &route) != nil {
					return report, fmt.Errorf("订阅路由格式无效")
				}
				paths, err := p.PublicRoutePaths(route)
				if err != nil || routeConflictsAdmin(paths, effectiveAdmin) {
					report.Errors = append(report.Errors, "订阅地址无效或与后台入口冲突")
				}
			}
			if namespace == "access" && collection == "accounts" || namespace == "subscriptions" && collection == "links" {
				var record p.Record
				if e = json.Unmarshal([]byte(raw), &record); e != nil {
					return report, e
				}
				user := p.Text(record, "userId")
				if conflicts.userCounts[user] != 1 {
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
					if conflicts.fields[importFieldKey{namespace, collection, field, "s:" + value}] {
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
				numericKey, e := importValueKey(value)
				if e != nil {
					return report, e
				}
				if conflicts.fields[importFieldKey{namespace, collection, field, numericKey}] {
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

type importDocumentKey struct{ namespace, collection, id string }
type importFieldKey struct{ namespace, collection, field, value string }
type importConflicts struct {
	userIDs, emails map[string]bool
	userCounts      map[string]int
	documents       map[importDocumentKey]bool
	fields          map[importFieldKey]bool
}

func importValueKey(value any) (string, error) {
	switch v := value.(type) {
	case nil:
		return "", nil
	case string:
		return "s:" + v, nil
	case int64:
		return "n:" + strconv.FormatInt(v, 10), nil
	case float64:
		if v == 0 {
			v = 0
		}
		return "n:" + strconv.FormatFloat(v, 'f', -1, 64), nil
	case bool:
		if v {
			return "n:1", nil
		}
		return "n:0", nil
	default:
		return "", fmt.Errorf("数字标识格式无效：%T", value)
	}
}

func loadImportConflicts(tx *sql.Tx, id string) (importConflicts, error) {
	index := importConflicts{map[string]bool{}, map[string]bool{}, map[string]int{}, map[importDocumentKey]bool{}, map[importFieldKey]bool{}}
	read := func(query string, visit func(*sql.Rows) error, args ...any) error {
		rows, e := tx.Query(query, args...)
		if e != nil {
			return e
		}
		defer rows.Close()
		for rows.Next() {
			if e = visit(rows); e != nil {
				return e
			}
		}
		return rows.Err()
	}
	if e := read("SELECT id,lower(email) FROM users", func(rows *sql.Rows) error {
		var user, email string
		if e := rows.Scan(&user, &email); e != nil {
			return e
		}
		index.userIDs[user], index.emails[email] = true, true
		index.userCounts[user]++
		return nil
	}); e != nil {
		return index, e
	}
	if e := read("SELECT id,COUNT(*) FROM import_rows WHERE run_id=? AND kind='user' GROUP BY id", func(rows *sql.Rows) error {
		var user string
		var count int
		if e := rows.Scan(&user, &count); e != nil {
			return e
		}
		index.userCounts[user] += count
		return nil
	}, id); e != nil {
		return index, e
	}
	if e := read("SELECT namespace,collection,id FROM documents", func(rows *sql.Rows) error {
		var key importDocumentKey
		if e := rows.Scan(&key.namespace, &key.collection, &key.id); e != nil {
			return e
		}
		index.documents[key] = true
		return nil
	}); e != nil {
		return index, e
	}
	fields := []string{"userId", "credential", "token", "numericId", "wireId", "number"}
	e := read(`SELECT namespace,collection,json_extract(data,'$.userId'),json_extract(data,'$.credential'),json_extract(data,'$.token'),json_extract(data,'$.numericId'),json_extract(data,'$.wireId'),json_extract(data,'$.number') FROM documents WHERE (namespace='access' AND collection='accounts') OR (namespace='subscriptions' AND collection='links') OR (namespace='nodes' AND collection IN ('nodes','machines'))`, func(rows *sql.Rows) error {
		var namespace, collection string
		values := make([]any, len(fields))
		dest := []any{&namespace, &collection}
		for i := range values {
			dest = append(dest, &values[i])
		}
		if e := rows.Scan(dest...); e != nil {
			return e
		}
		for i, value := range values {
			if value == nil {
				continue
			}
			key, e := importValueKey(value)
			if e != nil {
				return e
			}
			index.fields[importFieldKey{namespace, collection, fields[i], key}] = true
		}
		return nil
	})
	return index, e
}
