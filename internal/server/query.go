package server

import (
	"encoding/json"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"net/http"
	"strings"
)

func (s *Server) queryRuntime(w http.ResponseWriter, r *http.Request, actor p.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "storage:own") {
		forbidden(w, "未获存储权限")
		return
	}
	var b struct {
		Collection string `json:"collection"`
		Filters    []struct {
			Field string `json:"field"`
			Value any    `json:"value"`
		} `json:"filters"`
		Offset int `json:"offset"`
		Limit  int `json:"limit"`
	}
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
		if f.Field == "id" {
			where += " AND id IS ?"
			args = append(args, f.Value)
		} else {
			where += " AND json_extract(data,?) IS ?"
			args = append(args, "$."+f.Field, f.Value)
		}
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
