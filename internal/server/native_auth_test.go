package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/internal/store"
)

func TestNativeAuthorization(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "panel.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	_, err = db.DB.Exec("INSERT INTO users VALUES('member','member@test.invalid','Member','unused','member','active',?)", store.Now())
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.DB.Exec("INSERT INTO sessions VALUES('browser-session','member','2099-01-01T00:00:00Z')")
	if err != nil {
		t.Fatal(err)
	}
	handler := (&Server{Store: db, Plugins: plugins.New(db, filepath.Join(dir, "plugins"), "http://127.0.0.1"), PublicURL: "https://panel.test"}).Handler()
	call := func(path, token string, body any, status int) map[string]any {
		t.Helper()
		raw, _ := json.Marshal(body)
		r := httptest.NewRequest("POST", "/api/v1"+path, strings.NewReader(string(raw)))
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s: got %d: %s", path, w.Code, w.Body)
		}
		var result struct{ Data map[string]any }
		_ = json.Unmarshal(w.Body.Bytes(), &result)
		return result.Data
	}
	proof := "client-verifier-with-at-least-32-random-characters"
	flow := call("/auth/native", "", map[string]string{"name": "Client", "challenge": digest(proof)}, 200)
	id := flow["id"].(string)
	call("/auth/native/"+id+"/token", "", map[string]string{"proof": "wrong"}, 403)
	if call("/auth/native/"+id+"/token", "", map[string]string{"proof": proof}, 200)["status"] != "pending" {
		t.Fatal("unapproved client received a session")
	}
	call("/auth/native/"+id+"/approve", "", map[string]string{}, 401)
	call("/auth/native/"+id+"/approve", "browser-session", map[string]string{}, 200)
	result := call("/auth/native/"+id+"/token", "", map[string]string{"proof": proof}, 200)
	token := result["token"].(string)
	call("/auth/native/"+id+"/token", "", map[string]string{"proof": proof}, 410)
	call("/auth/browser-link", token, map[string]string{"redirectPath": "https://other.test"}, 400)
	call("/auth/browser-link", token, map[string]string{"redirectPath": "/admin"}, 400)
	link := call("/auth/browser-link", token, map[string]string{"redirectPath": "/user/plans"}, 200)
	secret := strings.Split(link["url"].(string), "#")[1]
	if call("/auth/browser-link/complete", "", map[string]string{"token": secret}, 200)["redirectPath"] != "/user/plans" {
		t.Fatal("browser destination changed")
	}
	call("/auth/browser-link/complete", "", map[string]string{"token": secret}, 410)
	call("/auth/logout", token, map[string]string{}, 200)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	if w.Code != 401 {
		t.Fatal("native session remained usable after logout")
	}
}
