package server

import (
	"path/filepath"
	"testing"

	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func TestImportRoutesConflict(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	_, err = db.DB.Exec(`INSERT INTO import_runs(id,owner,status,metadata,created_at) VALUES('run','import-xboard','staging','{"expectedRows":2}','now');
	INSERT INTO import_rows VALUES('run','setting','','','adminPath','"/private"');
	INSERT INTO import_rows VALUES('run','document','subscriptions','public_routes','primary','{"enabled":true,"path":"/sub","baseUrls":"https://example.com"}');`)
	if err != nil {
		t.Fatal(err)
	}
	check := func() bool {
		tx, err := db.DB.Begin()
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		report, err := checkImport(tx, "run", func(string) bool { return true }, map[string]p.Manifest{"subscriptions": {ID: "subscriptions", PublicPaths: []string{"/s"}, PublicRouteTarget: "/s"}})
		if err != nil {
			t.Fatal(err)
		}
		return len(report.Errors) == 0
	}
	if !check() {
		t.Fatal("valid routes rejected")
	}
	if err := db.Set("adminPath", "/different"); err != nil {
		t.Fatal(err)
	}
	if check() {
		t.Fatal("custom admin path overwritten")
	}
	if err := db.Set("adminPath", "/admin"); err != nil {
		t.Fatal(err)
	}
	_, err = db.DB.Exec(`UPDATE import_rows SET data='{"enabled":true,"path":"/private","baseUrls":""}' WHERE kind='document'`)
	if err != nil {
		t.Fatal(err)
	}
	if check() {
		t.Fatal("conflicting routes accepted")
	}
}
