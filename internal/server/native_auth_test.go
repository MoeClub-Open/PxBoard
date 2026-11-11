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
	call := func(method, token string, body any, status int) any {
		t.Helper()
		raw, _ := json.Marshal(body)
		r := httptest.NewRequest("POST", "/rpc/v1/core/"+method, strings.NewReader(string(raw)))
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s: got %d: %s", method, w.Code, w.Body)
		}
		var result struct{ Data any }
		_ = json.Unmarshal(w.Body.Bytes(), &result)
		return result.Data
	}
	proof := "client-verifier-with-at-least-32-random-characters"
	flow := call("auth.authorizeCreate", "", map[string]string{"name": "Client", "challenge": digest(proof)}, 200).(map[string]any)
	id := flow["id"].(string)
	call("auth.authorizeExchange", "", map[string]string{"id": id, "proof": "wrong"}, 403)
	if call("auth.authorizeExchange", "", map[string]string{"id": id, "proof": proof}, 200).(map[string]any)["status"] != "pending" {
		t.Fatal("unapproved client received a session")
	}
	call("auth.authorizeApprove", "", map[string]string{"id": id}, 401)
	call("auth.authorizeApprove", "browser-session", map[string]string{"id": id}, 200)
	result := call("auth.authorizeExchange", "", map[string]string{"id": id, "proof": proof}, 200).(map[string]any)
	token := result["token"].(string)
	call("auth.authorizeExchange", "", map[string]string{"id": id, "proof": proof}, 410)
	call("auth.browserLink", token, map[string]string{"redirectPath": "https://other.test"}, 400)
	call("auth.browserLink", token, map[string]string{"redirectPath": "/admin"}, 400)
	link := call("auth.browserLink", token, map[string]string{"redirectPath": "/user/plans"}, 200).(map[string]any)
	secret := strings.Split(link["url"].(string), "#")[1]
	if call("auth.browserExchange", "", map[string]string{"token": secret}, 200).(map[string]any)["redirectPath"] != "/user/plans" {
		t.Fatal("browser destination changed")
	}
	call("auth.browserExchange", "", map[string]string{"token": secret}, 410)
	call("auth.logout", token, map[string]string{}, 200)
	request := httptest.NewRequest(http.MethodPost, "/rpc/v1/core/account.me", strings.NewReader("{}"))
	request.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, request)
	if w.Code != 401 {
		t.Fatal("native session remained usable after logout")
	}
}
