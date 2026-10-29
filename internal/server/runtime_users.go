package server

import (
	"database/sql"
	"encoding/json"

	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

// A plugin may create its initial user record in the same transaction as the
// account, so an interrupted registration cannot leave an unusable account.
func (s *Server) createRuntimeUser(pluginID string, b p.Record) (string, error) {
	if !s.onboardingComplete() {
		return "", problem("站点尚未完成初始化")
	}
	initial, provided := b["initialRecord"]
	if !provided {
		return s.createUser(b)
	}
	if !s.Plugins.Permission(pluginID, "storage:own") {
		return "", problem("插件未获存储权限")
	}
	value, ok := initial.(map[string]any)
	if !ok {
		return "", problem("初始记录无效")
	}
	collection := p.Text(value, "collection")
	data, ok := value["data"].(map[string]any)
	if collection == "" || !ok || p.Text(data, "id") == "" {
		return "", problem("初始记录缺少集合或标识")
	}
	return s.createUser(b, func(tx *sql.Tx, userID string) error {
		data["userId"] = userID
		raw, e := json.Marshal(data)
		if e != nil {
			return e
		}
		_, e = tx.Exec("INSERT INTO documents(namespace,collection,id,data,updated_at)VALUES(?,?,?,?,?)", pluginID, collection, p.Text(data, "id"), string(raw), store.Now())
		return e
	})
}
