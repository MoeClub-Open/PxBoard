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
	targets := map[string]p.Manifest{}
	for _, plugin := range all {
		if plugin.Enabled && plugin.Error == "" {
			targets[plugin.ID] = plugin.Manifest
		}
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	report, e := checkImport(tx, id, has, targets)
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
func checkImport(tx *sql.Tx, id string, has func(string) bool, targets map[string]p.Manifest) (p.ImportReport, error) {
	report := p.ImportReport{ID: id, Status: "ready", Errors: []string{}}
	var metadata, owner string
	if e := tx.QueryRow("SELECT metadata,owner FROM import_runs WHERE id=?", id).Scan(&metadata, &owner); e != nil {
		return report, e
	}
	var expected struct {
		Rows int `json:"expectedRows"`
	}
	if e := json.Unmarshal([]byte(metadata), &expected); e != nil {
		return report, e
	}
	conflicts, e := loadImportConflicts(tx, id, targets)
	if e != nil {
		return report, e
	}
	rows, e := tx.Query("SELECT kind,namespace,collection,id,data FROM import_rows WHERE run_id=?", id)
	if e != nil {
		return report, e
	}
	defer rows.Close()
	emails := map[string]bool{}
	uniqueValues := map[importFieldKey]bool{}
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
	existingRoutes, e := registeredRoutes(tx)
	if e != nil {
		return report, e
	}
	for _, route := range existingRoutes {
		if routeConflictsAdmin([]string{route.path}, effectiveAdmin) {
			report.Errors = append(report.Errors, "后台入口与现有公开路由冲突")
		}
	}
	stagedRoutes := []registeredRoute{}
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
			if !has(namespace) || targets[namespace].ID == "" {
				report.Errors = append(report.Errors, "目标插件未启用或没有导入权限："+namespace)
			}
			if conflicts.documents[importDocumentKey{namespace, collection, key}] {
				report.Errors = append(report.Errors, "目标记录已存在："+namespace+"/"+collection+"/"+key)
			}
			var record p.Record
			if e = json.Unmarshal([]byte(raw), &record); e != nil {
				return report, e
			}
			if slices.Contains(targets[owner].RequiredImportRules[namespace], collection) {
				declared := false
				for _, rule := range targets[namespace].ImportRules {
					declared = declared || rule.Collection == collection
				}
				if !declared {
					report.Errors = append(report.Errors, "目标插件缺少所需导入校验，请更新插件："+namespace+"/"+collection)
				}
			}
			if collection == "public_routes" && p.Bool(record, "enabled") {
				paths, err := p.PublicRoutePaths(record)
				if err != nil || !publicTarget(targets[namespace]) || routeConflictsAdmin(paths, effectiveAdmin) {
					report.Errors = append(report.Errors, "公开路由无效或与后台入口冲突")
				}
				for _, path := range paths {
					for _, old := range append(existingRoutes, stagedRoutes...) {
						if routeConflictsAdmin([]string{path}, old.path) {
							report.Errors = append(report.Errors, "公开路由配置冲突")
						}
					}
					stagedRoutes = append(stagedRoutes, registeredRoute{owner: namespace, id: key, path: path})
				}
			}
			for _, rule := range targets[namespace].ImportRules {
				if rule.Collection != collection {
					continue
				}
				for _, field := range rule.Required {
					if record[field] == nil || record[field] == "" {
						report.Errors = append(report.Errors, "必填字段缺失："+namespace+"/"+collection+"/"+key+"/"+field)
					}
				}
				if rule.UserField != "" && conflicts.userCounts[p.Text(record, rule.UserField)] != 1 {
					report.Errors = append(report.Errors, "记录所属用户缺失或重复："+key)
				}
				for _, field := range rule.Unique {
					value, err := importValueKey(record[field])
					if err != nil {
						return report, err
					}
					if value == "" {
						continue
					}
					fieldKey := importFieldKey{namespace, collection, field, value}
					if uniqueValues[fieldKey] || conflicts.fields[fieldKey] {
						report.Errors = append(report.Errors, "唯一字段冲突："+namespace+"/"+collection+"/"+key+"/"+field)
					}
					uniqueValues[fieldKey] = true
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

func loadImportConflicts(tx *sql.Tx, id string, targets map[string]p.Manifest) (importConflicts, error) {
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
	e := read("SELECT namespace,collection,data FROM documents", func(rows *sql.Rows) error {
		var namespace, collection, raw string
		if e := rows.Scan(&namespace, &collection, &raw); e != nil {
			return e
		}
		rules := targets[namespace].ImportRules
		if len(rules) == 0 {
			return nil
		}
		var record p.Record
		if e := json.Unmarshal([]byte(raw), &record); e != nil {
			return e
		}
		for _, rule := range rules {
			if rule.Collection == collection {
				for _, field := range rule.Unique {
					value, e := importValueKey(record[field])
					if e != nil {
						return e
					}
					if value != "" {
						index.fields[importFieldKey{namespace, collection, field, value}] = true
					}
				}
			}
		}
		return nil
	})
	return index, e
}
