package plugins

import (
	"fmt"

	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

// A plugin can require its own offline migration before upgrading stored data.
func (m *Manager) checkMigration(manifest plugin.Manifest) error {
	guard := manifest.MigrationGuard
	if guard.BeforeVersion != "" {
		old, err := m.Get(manifest.ID)
		if err != nil {
			return err
		}
		if compatible(versionWithEpoch(old.Manifest), guard.BeforeVersion) {
			return nil
		}
	}
	if guard.MarkerCollection == "" || guard.MarkerID == "" || guard.Message == "" {
		return fmt.Errorf("插件迁移要求无效：%s", manifest.ID)
	}
	var marker int
	if err := m.Store.DB.QueryRow("SELECT count(*) FROM documents WHERE namespace=? AND collection=? AND id=?", manifest.ID, guard.MarkerCollection, guard.MarkerID).Scan(&marker); err != nil {
		return err
	}
	if marker != 0 {
		return nil
	}
	if guard.Required {
		return fmt.Errorf("%s", guard.Message)
	}
	for _, collection := range guard.Collections {
		var count int
		if err := m.Store.DB.QueryRow("SELECT count(*) FROM documents WHERE namespace=? AND collection=?", manifest.ID, collection).Scan(&count); err != nil {
			return err
		}
		if count != 0 {
			return fmt.Errorf("%s", guard.Message)
		}
	}
	for _, event := range guard.PendingEvents {
		var count int
		if err := m.Store.DB.QueryRow("SELECT count(*) FROM deliveries d JOIN events e ON e.id=d.event_id WHERE d.plugin_id=? AND d.done=0 AND e.type=?", manifest.ID, event).Scan(&count); err != nil {
			return err
		}
		if count != 0 {
			return fmt.Errorf("%s", guard.Message)
		}
	}
	return nil
}
