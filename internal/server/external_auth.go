package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"path"
	"slices"
	"strings"
	"time"

	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

type externalLoginGrant struct {
	Plugin       string `json:"plugin"`
	UserID       string `json:"userId"`
	ProofDigest  string `json:"proofDigest"`
	RedirectPath string `json:"redirectPath"`
	ExpiresAt    string `json:"expiresAt"`
}

func loginRedirect(value string) (string, bool) {
	if value == "" {
		return "/user", true
	}
	u, e := url.Parse(value)
	if e != nil || u.IsAbs() || u.Host != "" || strings.Contains(value, "\\") || !strings.HasPrefix(value, "/") {
		return "", false
	}
	u.Path = path.Clean(u.Path)
	u.RawPath = ""
	for _, root := range []string{"/user", "/admin", "/account"} {
		if u.Path == root || strings.HasPrefix(u.Path, root+"/") {
			return u.String(), true
		}
	}
	return "", false
}

func (s *Server) createLoginGrant(w http.ResponseWriter, r *http.Request, actor plugin.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "auth:login") {
		forbidden(w, "插件未获登录授权")
		return
	}
	var b struct {
		UserID       string `json:"userId"`
		ProofDigest  string `json:"proofDigest"`
		RedirectPath string `json:"redirectPath"`
	}
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	proof, e := hex.DecodeString(b.ProofDigest)
	redirect, allowed := loginRedirect(b.RedirectPath)
	if e != nil || len(proof) != sha256.Size || !allowed {
		plugin.Fail(w, 400, "登录凭证或跳转地址无效")
		return
	}
	var active int
	if s.Store.DB.QueryRow("SELECT count(*) FROM users WHERE id=? AND status='active'", b.UserID).Scan(&active) != nil || active != 1 {
		plugin.Fail(w, 403, "账户不存在或已停用")
		return
	}
	ticket := plugin.ID() + plugin.ID()
	expires := time.Now().Add(3 * time.Minute).UTC().Format(time.RFC3339)
	grant := externalLoginGrant{actor.Plugin, b.UserID, hex.EncodeToString(proof), redirect, expires}
	raw, e := json.Marshal(grant)
	if bad(w, e) {
		return
	}
	_, e = s.Store.DB.Exec("DELETE FROM settings WHERE key LIKE 'login-grant:%' AND json_extract(value,'$.expiresAt')<=?", time.Now().UTC().Format(time.RFC3339))
	if bad(w, e) || bad(w, s.Store.Set("login-grant:"+ticket, string(raw))) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	plugin.JSON(w, plugin.LoginGrant{Ticket: ticket, ExpiresAt: expires})
}

func (s *Server) verifyExternalCredential(w http.ResponseWriter, r *http.Request, actor plugin.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "auth:login") {
		forbidden(w, "插件未获登录授权")
		return
	}
	var b struct{ UserID, Password, Code string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	var encoded string
	valid, mfa := false, false
	if s.Store.DB.QueryRow("SELECT password FROM users WHERE id=? AND status='active'", b.UserID).Scan(&encoded) == nil {
		valid, mfa = s.verifyUser(b.UserID, encoded, b.Password, b.Code)
	}
	if mfa {
		plugin.FailCode(w, 401, "mfa_required", "请输入正确的动态验证码")
		return
	}
	if !valid {
		plugin.Fail(w, 401, "密码不正确或账户已停用")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	plugin.JSON(w, plugin.Record{"verified": true})
}

func (s *Server) completeExternalLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var b struct{ Ticket, Proof, Code string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	if b.Ticket == "" || len(b.Proof) < 32 {
		plugin.Fail(w, 401, "登录凭证无效，请重新登录")
		return
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	var raw string
	var grant externalLoginGrant
	if tx.QueryRow("SELECT value FROM settings WHERE key=?", "login-grant:"+b.Ticket).Scan(&raw) != nil || json.Unmarshal([]byte(raw), &grant) != nil {
		plugin.Fail(w, 401, "登录凭证无效或已使用，请重新登录")
		return
	}
	expires, e := time.Parse(time.RFC3339, grant.ExpiresAt)
	proof := sha256.Sum256([]byte(b.Proof))
	if e != nil || !expires.After(time.Now()) || !hmac.Equal([]byte(grant.ProofDigest), []byte(hex.EncodeToString(proof[:]))) {
		plugin.Fail(w, 401, "登录凭证无效或已到期，请重新登录")
		return
	}
	var enabled bool
	var manifest plugin.Manifest
	if tx.QueryRow("SELECT enabled,manifest FROM plugins WHERE id=?", grant.Plugin).Scan(&enabled, &raw) != nil || !enabled || json.Unmarshal([]byte(raw), &manifest) != nil || !slices.Contains(manifest.Permissions, "auth:login") {
		plugin.Fail(w, 403, "登录插件已停用或授权已撤回")
		return
	}
	var user plugin.Actor
	var secret string
	if tx.QueryRow("SELECT u.id,u.email,u.role,COALESCE(c.mfa_secret,'') FROM users u LEFT JOIN user_credentials c ON c.user_id=u.id WHERE u.id=? AND u.status='active'", grant.UserID).Scan(&user.ID, &user.Email, &user.Role, &secret) != nil {
		plugin.Fail(w, 403, "账户不存在或已停用")
		return
	}
	if secret != "" && !verifyTOTP(secret, b.Code) {
		plugin.FailCode(w, 401, "mfa_required", "请输入正确的动态验证码")
		return
	}
	redirect, allowed := loginRedirect(grant.RedirectPath)
	if !allowed {
		plugin.Fail(w, 400, "登录跳转地址无效")
		return
	}
	token, _, e := store.CreateSession(tx, user.ID)
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("DELETE FROM settings WHERE key=?", "login-grant:"+b.Ticket)
	if bad(w, e) || bad(w, tx.Commit()) {
		return
	}
	s.cookie(w, token, store.SessionMaxAge)
	s.Store.Log(user.Email, "auth.external-login", grant.Plugin)
	plugin.JSON(w, plugin.Record{"user": user, "redirectPath": redirect})
}
