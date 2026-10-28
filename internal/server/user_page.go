package server

import (
	"net/http"
	"strconv"
	"strings"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (s *Server) userPage(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 1000 {
		limit = 30
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	offset = max(0, offset)
	search := "%" + strings.TrimSpace(r.URL.Query().Get("q")) + "%"
	var total int
	if bad(w, s.Store.DB.QueryRow("SELECT COUNT(*) FROM users WHERE email LIKE ? OR name LIKE ?", search, search).Scan(&total)) {
		return
	}
	rows, err := s.Store.DB.Query("SELECT id,email,name,role,status,created_at FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC,id LIMIT ? OFFSET ?", search, search, limit, offset)
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
