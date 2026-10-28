package server

import (
	"encoding/json"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"net/http"
	"regexp"
	"strings"
)

func (s *Server) queryRuntime(w http.ResponseWriter, r *http.Request, actor p.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "storage:own") {
		forbidden(w, "未获存储权限")
		return
	}
	var b p.Query
	if bad(w, p.Decode(r, &b)) {
		return
	}
	if b.Limit <= 0 || b.Limit > 1000 {
		b.Limit = 100
	}
	b.Offset = max(0, b.Offset)
	where := "namespace=? AND collection=?"
	args := []any{actor.Plugin, b.Collection}
	for _, f := range b.Filters {
		if !queryField.MatchString(f.Field) {
			p.Fail(w, 400, "查询字段无效")
			return
		}
		field := "json_extract(data,'$." + f.Field + "')"
		if f.Field == "id" {
			field = "id"
		}
		if f.Op == "in" {
			values, ok := f.Value.([]any)
			if !ok {
				p.Fail(w, 400, "查询值必须为数组")
				return
			}
			if len(values) == 0 {
				where += " AND 0"
				continue
			}
			where += " AND " + field + " IN (" + strings.TrimSuffix(strings.Repeat("?,", len(values)), ",") + ")"
			args = append(args, values...)
		} else if f.Op == "" || f.Op == "eq" {
			where += " AND " + field + " IS ?"
			args = append(args, f.Value)
		} else {
			p.Fail(w, 400, "不支持的查询条件")
			return
		}
	}
	if b.Search != "" && (len(b.SearchFields) > 0 || b.SearchUserField != "") {
		fields := []string{}
		for _, field := range b.SearchFields {
			if !queryField.MatchString(field) {
				p.Fail(w, 400, "查询字段无效")
				return
			}
			fields = append(fields, "CAST(json_extract(data,'$."+field+"') AS TEXT) LIKE ?")
			args = append(args, "%"+b.Search+"%")
		}
		if b.SearchUserField != "" {
			if !queryField.MatchString(b.SearchUserField) {
				p.Fail(w, 400, "用户关联字段无效")
				return
			}
			if !s.Plugins.Permission(actor.Plugin, "users:read") {
				forbidden(w, "未获用户读取权限")
				return
			}
			fields = append(fields, "json_extract(data,'$."+b.SearchUserField+"') IN (SELECT id FROM users WHERE email LIKE ? OR name LIKE ?)")
			args = append(args, "%"+b.Search+"%", "%"+b.Search+"%")
		}
		where += " AND (" + strings.Join(fields, " OR ") + ")"
	}
	var total int
	if bad(w, s.Store.DB.QueryRow("SELECT COUNT(*) FROM documents WHERE "+where, args...).Scan(&total)) {
		return
	}
	args = append(args, b.Limit, b.Offset)
	rows, e := s.Store.DB.Query("SELECT data FROM documents WHERE "+where+" ORDER BY id LIMIT ? OFFSET ?", args...)
	if bad(w, e) {
		return
	}
	defer rows.Close()
	items := []p.Record{}
	for rows.Next() {
		var raw string
		if bad(w, rows.Scan(&raw)) {
			return
		}
		var item p.Record
		decoder := json.NewDecoder(strings.NewReader(raw))
		decoder.UseNumber()
		if bad(w, decoder.Decode(&item)) {
			return
		}
		items = append(items, item)
	}
	if !bad(w, rows.Err()) {
		p.JSON(w, p.Record{"items": items, "total": total})
	}
}

var queryField = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.]*$`)
