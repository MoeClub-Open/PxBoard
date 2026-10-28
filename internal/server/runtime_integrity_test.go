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

func TestCommitAtomicityAndRetry(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	server := &Server{Store: db, Plugins: plugins.New(db, t.TempDir(), "")}
	for _, manifest := range []p.Manifest{{ID: "writer", Permissions: []string{"storage:own", "emit:changed"}}, {ID: "consumer", Events: []string{"changed"}}} {
		raw, _ := json.Marshal(manifest)
		if _, err := db.DB.Exec("INSERT INTO plugins VALUES(?,?,1,'0.0.1','local','now')", manifest.ID, string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	call := func(body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest("POST", "/", strings.NewReader(body))
		response := httptest.NewRecorder()
		server.commitRuntime(response, request, p.Actor{Role: "service", Plugin: "writer"})
		return response
	}
	count := func(table string) int {
		var n int
		if err := db.DB.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	bad := `{"operationId":"one","writes":[{"collection":"things","record":{"id":"row"}},{"collection":"things","record":{}}],"events":[{"type":"changed","data":{}}]}`
	if response := call(bad); response.Code != 400 || count("documents") != 0 || count("events") != 0 || count("mutations") != 0 {
		t.Fatal("failed commit left partial data", response.Code, response.Body.String())
	}
	valid := `{"operationId":"one","writes":[{"collection":"things","record":{"id":"row","value":1}}],"events":[{"type":"changed","data":{"recordId":"row"}}]}`
	for range 2 {
		if response := call(valid); response.Code != 200 {
			t.Fatal(response.Body.String())
		}
	}
	if count("documents") != 1 || count("events") != 1 || count("deliveries") != 1 {
		t.Fatal("retry duplicated records or events")
	}
	forbidden := `{"operationId":"two","writes":[{"collection":"things","record":{"id":"other"}}],"events":[{"type":"forbidden","data":{}}]}`
	if response := call(forbidden); response.Code != 403 || count("documents") != 1 {
		t.Fatal("event permission was bypassed")
	}
}

func TestGenericRoutesAndImportRules(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	manifest := p.Manifest{ID: "example", PublicPaths: []string{"/download"}, PublicRouteTarget: "/download", ImportRules: []p.ImportRule{{Collection: "items", Required: []string{"serial"}, Unique: []string{"serial"}}}}
	raw, _ := json.Marshal(manifest)
	_, err = db.DB.Exec(`INSERT INTO plugins VALUES('example',?,1,'0.0.1','local','now'); INSERT INTO import_runs(id,owner,status,metadata,created_at) VALUES('run','import-test','staging','{"expectedRows":1}','now'); INSERT INTO import_rows VALUES('run','document','example','items','new','{"serial":"already"}');`, string(raw))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Put("example", "items", "existing", p.Record{"serial": "already"}); err != nil {
		t.Fatal(err)
	}
	if err := db.Put("example", "public_routes", "primary", p.Record{"enabled": true, "path": "/download-link", "baseUrls": ""}); err != nil {
		t.Fatal(err)
	}
	routes, err := registeredRoutes(db.DB)
	if err != nil || len(routes) != 1 || routes[0].owner != "example" {
		t.Fatal("route required a known plugin ID", err)
	}
	tx, err := db.DB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	report, err := checkImport(tx, "run", func(string) bool { return true }, map[string]p.Manifest{"example": manifest})
	if err != nil || len(report.Errors) == 0 {
		t.Fatal("declared unique constraint not checked", err)
	}
	server := &Server{Store: db}
	if err := server.validatePublicRoute(tx, "example", "public_routes", p.Record{"id": "other", "enabled": true, "path": "/download-link"}); err == nil {
		t.Fatal("duplicate route accepted")
	}
}

func TestUserSearchKeepsRecordScope(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	manifest, _ := json.Marshal(p.Manifest{ID: "reader", Permissions: []string{"storage:own", "users:read"}})
	if _, err := db.DB.Exec(`INSERT INTO plugins VALUES('reader',?,1,'0.0.1','local','now');INSERT INTO users VALUES('user','find@example.test','Find','unused','member','active','now')`, string(manifest)); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"allowed", "other"} {
		if err := db.Put("reader", "things", id, p.Record{"userId": "user", "scope": id, "createdAt": "2026-10-28T12:00:00Z"}); err != nil {
			t.Fatal(err)
		}
	}
	server := &Server{Store: db, Plugins: plugins.New(db, t.TempDir(), "")}
	body := `{"collection":"things","limit":12,"search":"find@","searchFields":["name"],"searchUserField":"userId","filters":[{"field":"scope","value":"allowed"},{"field":"createdAt","op":"gte","value":"2026-10-28T00:00:00Z"},{"field":"createdAt","op":"lte","value":"2026-10-28T23:59:59Z"}]}`
	response := httptest.NewRecorder()
	server.queryRuntime(response, httptest.NewRequest("POST", "/", strings.NewReader(body)), p.Actor{Role: "service", Plugin: "reader"})
	var result struct {
		Data p.QueryResult `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != 200 || result.Data.Total != 1 || p.Text(result.Data.Items[0], "id") != "allowed" {
		t.Fatal("user search bypassed scope or failed", response.Body.String(), err)
	}
}
