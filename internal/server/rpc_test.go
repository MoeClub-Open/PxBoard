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
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func TestUnifiedRPCAndBatchAndMachineAuth(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "panel.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.DB.Close()
	handler := (&Server{Store: db, Plugins: plugins.New(db, filepath.Join(dir, "plugins"), "http://127.0.0.1"), PublicURL: "https://panel.test"}).Handler()

	rpcCall := func(url, bearer, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, url, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if bearer != "" {
			req.Header.Set("Authorization", "Bearer "+bearer)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	// Retired /api/v1/* endpoints return 404.
	legacy := httptest.NewRequest(http.MethodGet, "/api/v1/setup", nil)
	legacyRec := httptest.NewRecorder()
	handler.ServeHTTP(legacyRec, legacy)
	if legacyRec.Code != 404 {
		t.Fatalf("expected retired /api/v1/setup to return 404, got %d", legacyRec.Code)
	}

	// Initialize admin via core/setup.init and login via core/auth.login (returns session token).
	if rec := rpcCall("/rpc/v1/core/setup.init", "", `{"email":"admin@test.invalid","password":"password-123456","name":"Admin","mode":"personal","siteName":"PxBoard","publicUrl":"https://panel.test"}`); rec.Code != 200 {
		t.Fatalf("setup.init failed: %d %s", rec.Code, rec.Body.String())
	}
	loginRec := rpcCall("/rpc/v1/core/auth.login", "", `{"email":"admin@test.invalid","password":"password-123456"}`)
	if loginRec.Code != 200 {
		t.Fatalf("auth.login failed: %d %s", loginRec.Code, loginRec.Body.String())
	}
	var loginData struct {
		Data struct {
			Token string `json:"token"`
			Role  string `json:"role"`
		} `json:"data"`
	}
	if err := json.Unmarshal(loginRec.Body.Bytes(), &loginData); err != nil || loginData.Data.Token == "" || loginData.Data.Role != "admin" {
		t.Fatalf("auth.login missing token: %v %s", err, loginRec.Body.String())
	}
	session := loginData.Data.Token

	// $batch executes concurrent read calls and returns per-key status + data.
	batchRec := rpcCall("/rpc/v1/$batch", session, `{"calls":[{"key":"me","service":"core","method":"account.me"},{"key":"plugins","service":"core","method":"plugins.list"},{"key":"setup","service":"core","method":"setup.get"}]}`)
	if batchRec.Code != 200 {
		t.Fatalf("$batch failed: %d %s", batchRec.Code, batchRec.Body.String())
	}
	var batchData struct {
		Data map[string]struct {
			Status int `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(batchRec.Body.Bytes(), &batchData); err != nil || batchData.Data["me"].Status != 200 || batchData.Data["plugins"].Status != 200 || batchData.Data["setup"].Status != 200 {
		t.Fatalf("unexpected $batch response: %s", batchRec.Body.String())
	}

	// Read-only API token allows read procedures and blocks write procedures.
	tokenRec := rpcCall("/rpc/v1/core/tokens.create", session, `{"name":"readonly","scope":"read"}`)
	var createdToken struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	_ = json.Unmarshal(tokenRec.Body.Bytes(), &createdToken)
	if rpcCall("/rpc/v1/core/account.me", createdToken.Data.Token, "{}").Code != 200 {
		t.Fatal("read token could not call account.me")
	}
	if rpcCall("/rpc/v1/core/settings.update", createdToken.Data.Token, `{"name":"Denied"}`).Code != 403 {
		t.Fatal("read token allowed write procedure")
	}

	// Machine authentication accepts 32-char migrated keys, 64-char keys, and pxm_<num>.<key>, and blocks non-server procedures.
	if err := db.Put("nodes", "machines", "m7", p.Record{"number": 7, "name": "osa", "key": "0123456789abcdef0123456789abcdef", "enabled": true}); err != nil {
		t.Fatal(err)
	}
	srv := &Server{Store: db, Plugins: plugins.New(db, filepath.Join(dir, "plugins"), "http://127.0.0.1")}
	for _, rawKey := range []string{"0123456789abcdef0123456789abcdef", "pxm_7.0123456789abcdef0123456789abcdef"} {
		req := httptest.NewRequest(http.MethodPost, "/rpc/v1/nodes/server.pull", strings.NewReader("{}"))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		actor, ok := srv.authenticate(req)
		if !ok || actor.Role != "machine" || actor.MachineID != 7 || actor.Name != "osa" {
			t.Fatalf("machine auth failed for %s: %+v %v", rawKey, actor, ok)
		}
	}
	if rpcCall("/rpc/v1/core/account.me", "0123456789abcdef0123456789abcdef", "{}").Code != 403 {
		t.Fatal("machine key allowed core user procedure")
	}
}

func TestServeRPCMuxTranslation(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /plans", func(w http.ResponseWriter, r *http.Request) {
		p.JSON(w, p.Record{"mine": r.URL.Query().Get("mine"), "scope": r.URL.Query().Get("scope")})
	})
	mux.HandleFunc("GET /plans/{id}/period-options", func(w http.ResponseWriter, r *http.Request) {
		p.JSON(w, p.Record{"id": r.PathValue("id")})
	})
	mux.HandleFunc("PATCH /settings", func(w http.ResponseWriter, r *http.Request) {
		var b p.Record
		_ = p.Decode(r, &b)
		p.JSON(w, b)
	})
	mux.HandleFunc("PATCH /nodes/{id}", func(w http.ResponseWriter, r *http.Request) {
		p.JSON(w, p.Record{"id": r.PathValue("id")})
	})
	mux.HandleFunc("POST /orders/{id}/cancel", func(w http.ResponseWriter, r *http.Request) {
		p.JSON(w, p.Record{"canceled": r.PathValue("id")})
	})
	call := func(method, body string) map[string]any {
		req := httptest.NewRequest(http.MethodPost, "http://plugin/_rpc/"+method, strings.NewReader(body))
		rec := httptest.NewRecorder()
		p.ServeRPC(mux, nil, rec, req)
		if rec.Code != 200 {
			t.Fatalf("%s failed: %d %s", method, rec.Code, rec.Body.String())
		}
		var env struct{ Data map[string]any }
		_ = json.Unmarshal(rec.Body.Bytes(), &env)
		return env.Data
	}
	if res := call("plans.list", `{"scope":"mine"}`); res["mine"] != "1" || res["scope"] != "mine" {
		t.Fatalf("unexpected plans.list query: %v", res)
	}
	if res := call("plans.periodOptions", `{"id":"p1"}`); res["id"] != "p1" {
		t.Fatalf("unexpected plans.periodOptions: %v", res)
	}
	if res := call("settings.update", `{"id":"default","enabled":true}`); res["enabled"] != true {
		t.Fatalf("singleton settings.update failed: %v", res)
	}
	if res := call("nodes.update", `{"id":"n42"}`); res["id"] != "n42" {
		t.Fatalf("collection nodes.update failed: %v", res)
	}
	if res := call("orders.cancel", `{"id":"ord9"}`); res["canceled"] != "ord9" {
		t.Fatalf("orders.cancel failed: %v", res)
	}
}
