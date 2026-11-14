package server

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MoeClub-Open/PxBoard/internal/plugins"
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

func TestImportCommitPurgesStagingRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "data.db")
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	importerManifest, _ := json.Marshal(p.Manifest{
		ID:          "import-xboard",
		Permissions: []string{"import:users", "import:settings"},
	})
	_, err = db.DB.Exec(
		`INSERT INTO plugins VALUES('import-xboard',?,1,'1!0.0.1','local','now')`,
		string(importerManifest),
	)
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{Store: db, Plugins: plugins.New(db, t.TempDir(), "")}
	actor := p.Actor{Role: "service", Plugin: "import-xboard"}
	call := func(path, body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		server.importRuntime(rec, httptest.NewRequest("POST", "/", strings.NewReader(body)), actor, path)
		return rec
	}
	if res := call("job1/begin", `{"expectedRows":2}`); res.Code != 200 {
		t.Fatalf("begin failed: %d %s", res.Code, res.Body.String())
	}
	stageBody := `{"rows":[
		{"kind":"user","id":"0123456789abcdef0123456789abcdef","data":{"id":"0123456789abcdef0123456789abcdef","email":"member@example.test","name":"Member","password":"$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234","passwordAlgorithm":"bcrypt","role":"member","status":"active","createdAt":"2026-10-28T00:00:00Z"}},
		{"kind":"setting","id":"adminPath","data":"/console"}
	]}`
	if res := call("job1/stage", stageBody); res.Code != 200 {
		t.Fatalf("stage failed: %d %s", res.Code, res.Body.String())
	}
	res := call("job1/commit", `{}`)
	if res.Code != 200 || !strings.Contains(res.Body.String(), `"status":"committed"`) {
		t.Fatalf("commit failed: %d %s", res.Code, res.Body.String())
	}
	var staged, users int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM import_rows WHERE run_id='job1'").Scan(&staged); err != nil || staged != 0 {
		t.Fatalf("expected 0 staged rows after commit, got %d (err=%v)", staged, err)
	}
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM users WHERE id='0123456789abcdef0123456789abcdef'").Scan(&users); err != nil || users != 1 {
		t.Fatalf("expected 1 committed user, got %d (err=%v)", users, err)
	}
	if res := call("job1/commit", `{}`); res.Code != 200 {
		t.Fatalf("idempotent commit failed: %d %s", res.Code, res.Body.String())
	}
	if _, err := db.DB.Exec(`INSERT INTO import_runs VALUES('legacy','import-xboard','committed','{}','now','now'); INSERT INTO import_rows VALUES('legacy','setting','','','adminPath','"/old"');`); err != nil {
		t.Fatal(err)
	}
	_ = db.DB.Close()
	reopened, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.DB.Close()
	if err := reopened.DB.QueryRow("SELECT COUNT(*) FROM import_rows").Scan(&staged); err != nil || staged != 0 {
		t.Fatalf("expected startup migration to purge legacy committed import_rows, got %d (err=%v)", staged, err)
	}
}
