package server

import (
	"net/http"
	"strings"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (s *Server) userOptions(w http.ResponseWriter, r *http.Request) {
	search := "%" + strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))) + "%"
	rows, err := s.Store.DB.Query("SELECT id,email FROM users WHERE email LIKE ? OR lower(name) LIKE ? OR id=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,email LIMIT 50", search, search, r.URL.Query().Get("id"), r.URL.Query().Get("id"))
	if bad(w, err) {
		return
	}
	defer rows.Close()
	options := []p.Record{}
	for rows.Next() {
		var id, email string
		if bad(w, rows.Scan(&id, &email)) {
			return
		}
		options = append(options, p.Record{"id": id, "name": email})
	}
	if !bad(w, rows.Err()) {
		p.JSON(w, options)
	}
}
