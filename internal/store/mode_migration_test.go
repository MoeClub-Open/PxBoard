package store

import (
	"path/filepath"
	"strings"
	"testing"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func TestSharingModeMigratesWithoutChangingData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "panel.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range map[string]string{"mode": "sharing", "requested_mode": "sharing", "mode_state": `{"mode":"sharing","requestedMode":"sharing","phase":"ready","plugins":[{"id":"registration","status":"ready"}]}`} {
		if err := s.Set(key, value); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Put("registration", "settings", "settings", p.Record{"enabled": true}); err != nil {
		t.Fatal(err)
	}
	s.DB.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.DB.Close()
	if s.Setting("mode", "") != "personal" || s.Setting("requested_mode", "") != "personal" {
		t.Fatal("mode was not migrated")
	}
	state := s.Setting("mode_state", "")
	if !strings.Contains(state, `"mode":"personal"`) || !strings.Contains(state, `"requestedMode":"personal"`) || !strings.Contains(state, `"registration"`) {
		t.Fatalf("unexpected state: %s", state)
	}
	data, err := s.List("registration", "settings")
	if err != nil || len(data) != 1 || !p.Bool(data[0], "enabled") {
		t.Fatal("plugin data changed")
	}
}
