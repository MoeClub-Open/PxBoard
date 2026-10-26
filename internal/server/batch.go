package server

import (
	"encoding/json"
	"net/http"

	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (s *Server) batchRuntime(w http.ResponseWriter, r *http.Request, actor p.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "storage:own") {
		forbidden(w, "未获存储权限")
		return
	}
	var b struct {
		Collection string     `json:"collection"`
		Records    []p.Record `json:"records"`
	}
	if bad(w, p.Decode(r, &b)) {
		return
	}
	if b.Collection == "" {
		p.Fail(w, 400, "缺少集合名称")
		return
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	stmt, e := tx.Prepare("INSERT INTO documents(namespace,collection,id,data,updated_at)VALUES(?,?,?,?,?) ON CONFLICT(namespace,collection,id)DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at")
	if bad(w, e) {
		return
	}
	defer stmt.Close()
	now := store.Now()
	for _, record := range b.Records {
		id := p.Text(record, "id")
		if id == "" {
			p.Fail(w, 400, "记录缺少标识")
			return
		}
		raw, e := json.Marshal(record)
		if bad(w, e) {
			return
		}
		if _, e = stmt.Exec(actor.Plugin, b.Collection, id, string(raw), now); bad(w, e) {
			return
		}
	}
	if !bad(w, tx.Commit()) {
		p.JSON(w, true)
	}
}
