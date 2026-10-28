package server

import (
	"net/http"
	"strings"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (s *Server) searchUsers(w http.ResponseWriter, r *http.Request, actor p.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "users:read") {
		forbidden(w, "未获用户读取权限")
		return
	}
	var b p.UserQuery
	if bad(w, p.Decode(r, &b)) {
		return
	}
	b.Offset = max(0, b.Offset)
	if b.Limit <= 0 || b.Limit > 1000 {
		b.Limit = 100
	}
	where := "(email LIKE ? OR name LIKE ?)"
	search := "%" + strings.TrimSpace(b.Search) + "%"
	args := []any{search, search}
	for _, filter := range []struct{ field, value string }{{"status", b.Status}, {"role", b.Role}} {
		if filter.value != "" {
			where += " AND " + filter.field + "=?"
			args = append(args, filter.value)
		}
	}
	var total int
	if bad(w, s.Store.DB.QueryRow("SELECT COUNT(*) FROM users WHERE "+where, args...).Scan(&total)) {
		return
	}
	rows, err := s.Store.DB.Query("SELECT id,email,name,role,status,created_at FROM users WHERE "+where+" ORDER BY id LIMIT ? OFFSET ?", append(args, b.Limit, b.Offset)...)
	if bad(w, err) {
		return
	}
	defer rows.Close()
	items := []p.Record{}
	for rows.Next() {
		var id, email, name, role, status, created string
		if bad(w, rows.Scan(&id, &email, &name, &role, &status, &created)) {
			return
		}
		items = append(items, p.Record{"id": id, "email": email, "name": name, "role": role, "status": status, "createdAt": created})
	}
	if !bad(w, rows.Err()) {
		p.JSON(w, p.QueryResult{Items: items, Total: total})
	}
}

func (s *Server) queryUsers(w http.ResponseWriter, r *http.Request, actor p.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "users:read") {
		forbidden(w, "未获用户读取权限")
		return
	}
	var b struct {
		IDs   []string `json:"ids"`
		Email string   `json:"email"`
	}
	if bad(w, p.Decode(r, &b)) {
		return
	}
	if len(b.IDs) == 0 && b.Email == "" {
		p.JSON(w, []p.Record{})
		return
	}
	args := make([]any, len(b.IDs))
	for i, id := range b.IDs {
		args[i] = id
	}
	where := "id IN (" + strings.TrimSuffix(strings.Repeat("?,", len(args)), ",") + ")"
	if b.Email != "" {
		where = "email=?"
		args = []any{strings.ToLower(strings.TrimSpace(b.Email))}
	}
	rows, err := s.Store.DB.Query("SELECT id,email,name,role,status,created_at FROM users WHERE "+where, args...)
	if bad(w, err) {
		return
	}
	defer rows.Close()
	users := []p.Record{}
	for rows.Next() {
		var id, email, name, role, status, created string
		if bad(w, rows.Scan(&id, &email, &name, &role, &status, &created)) {
			return
		}
		users = append(users, p.Record{"id": id, "email": email, "name": name, "role": role, "status": status, "createdAt": created})
	}
	if !bad(w, rows.Err()) {
		p.JSON(w, users)
	}
}
