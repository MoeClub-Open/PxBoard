package server

import (
	"encoding/json"
	"net/http"

	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (s *Server) commitRuntime(w http.ResponseWriter, r *http.Request, actor p.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "storage:own") {
		forbidden(w, "未获存储权限")
		return
	}
	var b struct {
		OperationID string       `json:"operationId"`
		Writes      []p.Write    `json:"writes"`
		Events      []p.Emission `json:"events"`
	}
	if bad(w, p.Decode(r, &b)) {
		return
	}
	if b.OperationID == "" {
		p.Fail(w, 400, "缺少操作标识")
		return
	}
	for _, event := range b.Events {
		if !s.Plugins.Permission(actor.Plugin, "emit:"+event.Type) {
			forbidden(w, "未获事件发布权限")
			return
		}
	}
	tx, err := s.Store.DB.Begin()
	if bad(w, err) {
		return
	}
	defer tx.Rollback()
	result, err := tx.Exec("INSERT OR IGNORE INTO mutations(namespace,id,created_at) VALUES(?,?,?)", actor.Plugin, "commit:"+b.OperationID, store.Now())
	if bad(w, err) {
		return
	}
	changed, _ := result.RowsAffected()
	if changed == 0 {
		p.JSON(w, true)
		return
	}
	for _, write := range b.Writes {
		if write.Collection == "" || p.Text(write.Record, "id") == "" {
			p.Fail(w, 400, "记录缺少集合或标识")
			return
		}
		if bad(w, s.validatePublicRoute(tx, actor.Plugin, write.Collection, write.Record)) {
			return
		}
		raw, err := json.Marshal(write.Record)
		if bad(w, err) {
			return
		}
		if _, err = tx.Exec("INSERT INTO documents VALUES(?,?,?,?,?) ON CONFLICT(namespace,collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at", actor.Plugin, write.Collection, p.Text(write.Record, "id"), string(raw), store.Now()); bad(w, err) {
			return
		}
	}
	for _, event := range b.Events {
		if bad(w, s.Plugins.Enqueue(tx, actor.Plugin, event.Type, event.Data)) {
			return
		}
	}
	if !bad(w, tx.Commit()) {
		p.JSON(w, true)
	}
}
