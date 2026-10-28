package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/internal/store"
)

func TestCustomAdminPath(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "panel.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	for _, setting := range [][2]string{{"mode", "business"}, {"adminPath", "/private-entry"}} {
		if err := db.Set(setting[0], setting[1]); err != nil {
			t.Fatal(err)
		}
	}
	for _, role := range []string{"admin", "member"} {
		if _, err := db.DB.Exec("INSERT INTO users(id,email,name,password,role,status,created_at) VALUES(?,?,?,?,?,'active',?)", role, role+"@test.invalid", role, "unused", role, store.Now()); err != nil {
			t.Fatal(err)
		}
		if _, err := db.DB.Exec("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)", role+"-session", role, "2099-01-01T00:00:00Z"); err != nil {
			t.Fatal(err)
		}
	}
	web := filepath.Join(dir, "web")
	if err := os.Mkdir(web, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(web, "index.html"), []byte("web"), 0600); err != nil {
		t.Fatal(err)
	}
	server := (&Server{Store: db, Plugins: plugins.New(db, filepath.Join(dir, "plugins"), "http://127.0.0.1"), Web: web}).Handler()
	call := func(method, url, session, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, url, strings.NewReader(body))
		if session != "" {
			req.AddCookie(&http.Cookie{Name: "px_session", Value: session})
		}
		rec := httptest.NewRecorder()
		server.ServeHTTP(rec, req)
		return rec
	}
	if got := call("GET", "/admin", "", "").Code; got != 404 {
		t.Fatalf("old admin route: %d", got)
	}
	if got := call("GET", "/private-entry", "", "").Code; got != 200 {
		t.Fatalf("new admin route: %d", got)
	}
	public := call("GET", "/api/v1/setup", "", "").Body.String()
	if strings.Contains(public, "private-entry") {
		t.Fatal("setup exposed admin path")
	}
	var result struct {
		Data struct {
			AdminEntry bool `json:"adminEntry"`
		} `json:"data"`
	}
	if err := json.Unmarshal(call("GET", "/api/v1/setup?entry=%2Fprivate-entry%2Fsettings", "", "").Body.Bytes(), &result); err != nil || !result.Data.AdminEntry {
		t.Fatal("entry not recognized", err)
	}
	if got := call("GET", "/api/v1/me", "member-session", "").Body.String(); strings.Contains(got, "private-entry") {
		t.Fatal("member saw admin path")
	}
	if got := call("GET", "/api/v1/me", "admin-session", "").Body.String(); !strings.Contains(got, "private-entry") {
		t.Fatal("admin did not receive admin path")
	}
	if got := call("GET", "/api/v1/settings", "", "").Code; got != 401 {
		t.Fatalf("anonymous settings: %d", got)
	}
	invalid := call("PATCH", "/api/v1/settings", "admin-session", `{"name":"changed","adminPath":"/user"}`)
	if invalid.Code != 400 || db.Setting("name", "") != "" {
		t.Fatal("invalid path changed settings")
	}
	saved := call("PATCH", "/api/v1/settings", "admin-session", `{"adminPath":"/manage-456"}`)
	if saved.Code != 200 || db.Setting("adminPath", "") != "/manage-456" {
		t.Fatal("valid path not saved")
	}
	if err := db.Set("mode", "personal"); err != nil {
		t.Fatal(err)
	}
	if got := call("GET", "/admin", "", "").Code; got != 200 {
		t.Fatal("personal default route unavailable")
	}
}
