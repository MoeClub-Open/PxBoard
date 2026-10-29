package server

import (
	"crypto/hmac"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

type nativeAuthorization struct {
	Name         string `json:"name"`
	Challenge    string `json:"challenge,omitempty"`
	UserID       string `json:"userId,omitempty"`
	RedirectPath string `json:"redirectPath,omitempty"`
	ExpiresAt    string `json:"expiresAt"`
}

func (s *Server) nativeRequest(w http.ResponseWriter, r *http.Request) {
	var b struct{ Name, Challenge string }
	if bad(w, p.Decode(r, &b)) {
		return
	}
	challenge, err := hex.DecodeString(b.Challenge)
	if len(challenge) != 32 || err != nil || strings.TrimSpace(b.Name) == "" {
		p.Fail(w, 400, "客户端名称或授权校验值无效")
		return
	}
	base, ok := publicOrigin(s.PublicURL)
	if !ok {
		base, ok = publicOrigin(s.Store.Setting("publicUrl", ""))
	}
	if !ok {
		p.Fail(w, 503, "尚未设置站点公开地址")
		return
	}
	id := p.ID() + p.ID()
	flow := nativeAuthorization{Name: b.Name, Challenge: b.Challenge, ExpiresAt: time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)}
	raw, _ := json.Marshal(flow)
	_, err = s.Store.DB.Exec("DELETE FROM settings WHERE (key LIKE 'native-auth:%' OR key LIKE 'browser-link:%') AND json_extract(value,'$.expiresAt')<=?", store.Now())
	if bad(w, err) || bad(w, s.Store.Set("native-auth:"+id, string(raw))) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	p.JSON(w, p.Record{"id": id, "authorizationUrl": base + "/user/authorize?request=" + url.QueryEscape(id), "expiresAt": flow.ExpiresAt, "intervalSeconds": 3})
}

func (s *Server) nativeStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var raw string
	var flow nativeAuthorization
	if s.Store.DB.QueryRow("SELECT value FROM settings WHERE key=?", "native-auth:"+r.PathValue("id")).Scan(&raw) != nil || json.Unmarshal([]byte(raw), &flow) != nil || flow.ExpiresAt <= store.Now() {
		p.Fail(w, 410, "授权已失效，请在客户端重新登录")
		return
	}
	p.JSON(w, p.Record{"name": flow.Name, "expiresAt": flow.ExpiresAt, "approved": flow.UserID != ""})
}

func (s *Server) nativeApprove(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	result, err := s.Store.DB.Exec("UPDATE settings SET value=json_set(value,'$.userId',?) WHERE key=? AND json_extract(value,'$.expiresAt')>? AND COALESCE(json_extract(value,'$.userId'),'')=''", actor(r).ID, "native-auth:"+r.PathValue("id"), store.Now())
	if bad(w, err) {
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		p.Fail(w, 410, "授权已处理或失效，请在客户端重新登录")
		return
	}
	s.Store.Log(actor(r).Email, "auth.native-approved", r.PathValue("id"))
	p.JSON(w, true)
}

func (s *Server) nativeToken(w http.ResponseWriter, r *http.Request) {
	var b struct{ Proof string }
	if bad(w, p.Decode(r, &b)) {
		return
	}
	s.exchangeNativeAuthorization(w, r, "native-auth:"+r.PathValue("id"), digest(b.Proof), false)
}

func (s *Server) browserLink(w http.ResponseWriter, r *http.Request) {
	var b struct{ RedirectPath string }
	if bad(w, p.Decode(r, &b)) {
		return
	}
	redirect, allowed := loginRedirect(b.RedirectPath)
	if !allowed || !(redirect == "/user" || strings.HasPrefix(redirect, "/user/") || strings.HasPrefix(redirect, "/user?")) {
		p.Fail(w, 400, "只能打开用户前台")
		return
	}
	base, ok := publicOrigin(s.PublicURL)
	if !ok {
		base, ok = publicOrigin(s.Store.Setting("publicUrl", ""))
	}
	if !ok {
		p.Fail(w, 503, "尚未设置站点公开地址")
		return
	}
	token := p.ID() + p.ID()
	flow := nativeAuthorization{UserID: actor(r).ID, RedirectPath: redirect, ExpiresAt: time.Now().Add(time.Minute).UTC().Format(time.RFC3339)}
	raw, _ := json.Marshal(flow)
	if bad(w, s.Store.Set("browser-link:"+digest(token), string(raw))) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	p.JSON(w, p.Record{"url": base + "/auth/browser#" + token, "expiresAt": flow.ExpiresAt})
}

func (s *Server) completeBrowserLink(w http.ResponseWriter, r *http.Request) {
	var b struct{ Token string }
	if bad(w, p.Decode(r, &b)) {
		return
	}
	s.exchangeNativeAuthorization(w, r, "browser-link:"+digest(b.Token), "", true)
}

func (s *Server) exchangeNativeAuthorization(w http.ResponseWriter, r *http.Request, key, challenge string, browser bool) {
	w.Header().Set("Cache-Control", "no-store")
	tx, err := s.Store.DB.Begin()
	if bad(w, err) {
		return
	}
	defer tx.Rollback()
	var raw string
	var flow nativeAuthorization
	if tx.QueryRow("SELECT value FROM settings WHERE key=?", key).Scan(&raw) != nil || json.Unmarshal([]byte(raw), &flow) != nil || flow.ExpiresAt <= store.Now() {
		p.Fail(w, 410, "授权已使用或到期，请重新登录")
		return
	}
	if !browser && !hmac.Equal([]byte(flow.Challenge), []byte(challenge)) {
		p.Fail(w, 403, "客户端授权校验失败")
		return
	}
	if flow.UserID == "" {
		p.JSON(w, p.Record{"status": "pending"})
		return
	}
	var user p.Actor
	if tx.QueryRow("SELECT id,email,role FROM users WHERE id=? AND status='active'", flow.UserID).Scan(&user.ID, &user.Email, &user.Role) != nil {
		p.Fail(w, 403, "账号已停用")
		return
	}
	token := p.ID() + p.ID()
	expires := time.Now().Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339)
	_, err = tx.Exec("INSERT INTO sessions VALUES(?,?,?)", token, user.ID, expires)
	if bad(w, err) {
		return
	}
	_, err = tx.Exec("DELETE FROM settings WHERE key=?", key)
	if bad(w, err) || bad(w, tx.Commit()) {
		return
	}
	if browser {
		s.cookie(w, token, 7*24*3600)
		p.JSON(w, p.Record{"redirectPath": flow.RedirectPath})
	} else {
		s.Store.Log(user.Email, "auth.native-login", flow.Name)
		p.JSON(w, p.Record{"status": "approved", "token": token, "expiresAt": expires, "user": user})
	}
}
