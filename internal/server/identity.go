package server

import (
	"database/sql"
	"encoding/json"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"slices"
	"strings"
	"time"
)

func (s *Server) resetRequest(w http.ResponseWriter, r *http.Request) {
	var b struct{ Email, ChallengeToken string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	if !s.verifyChallenge(w, r, "reset", b.ChallengeToken) {
		return
	}
	var id string
	if s.Store.DB.QueryRow("SELECT id FROM users WHERE email=? AND status='active'", strings.ToLower(strings.TrimSpace(b.Email))).Scan(&id) == nil {
		token := plugin.ID() + plugin.ID()
		value, _ := json.Marshal(plugin.Record{"userId": id, "expiresAt": time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339)})
		if bad(w, s.Store.Set("reset:"+token, string(value))) {
			return
		}
		if bad(w, s.Plugins.Emit("core", "auth.reset-requested", plugin.Record{"userId": id, "token": token})) {
			return
		}
	}
	plugin.JSON(w, plugin.Record{"message": "如果该邮箱可用，将收到密码重置邮件"})
}
func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var b struct{ Token, Password string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	if len(b.Password) < 10 {
		plugin.Fail(w, 400, "密码至少 10 位")
		return
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	var value string
	if e = tx.QueryRow("SELECT value FROM settings WHERE key=?", "reset:"+b.Token).Scan(&value); e != nil {
		plugin.Fail(w, 400, "链接无效或已到期")
		return
	}
	var record plugin.Record
	_ = json.Unmarshal([]byte(value), &record)
	if plugin.Text(record, "expiresAt") < store.Now() {
		plugin.Fail(w, 400, "链接已到期")
		return
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("UPDATE users SET password=? WHERE id=?", string(hash), record["userId"])
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("UPDATE user_credentials SET algorithm='bcrypt',salt='' WHERE user_id=?", record["userId"])
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("DELETE FROM sessions WHERE user_id=?", record["userId"])
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("DELETE FROM api_tokens WHERE user_id=?", record["userId"])
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("DELETE FROM settings WHERE key=?", "reset:"+b.Token)
	if bad(w, e) {
		return
	}
	if !bad(w, tx.Commit()) {
		plugin.JSON(w, true)
	}
}
func (s *Server) initialized() bool {
	var n int
	_ = s.Store.DB.QueryRow("SELECT count(*) FROM users WHERE role='admin'").Scan(&n)
	return n > 0
}
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var b struct{ CurrentPassword, Password, Code string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	var old string
	valid := false
	if s.Store.DB.QueryRow("SELECT password FROM users WHERE id=?", actor(r).ID).Scan(&old) == nil {
		valid, _ = s.verifyUser(actor(r).ID, old, b.CurrentPassword, b.Code)
	}
	if !valid {
		plugin.Fail(w, 400, "当前密码不正确")
		return
	}
	if len(b.Password) < 10 {
		plugin.Fail(w, 400, "密码至少 10 位")
		return
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if bad(w, e) {
		return
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	_, e = tx.Exec("UPDATE users SET password=? WHERE id=?", string(hash), actor(r).ID)
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("DELETE FROM sessions WHERE user_id=?", actor(r).ID)
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("UPDATE user_credentials SET algorithm='bcrypt',salt='' WHERE user_id=?", actor(r).ID)
	if bad(w, e) {
		return
	}
	_, e = tx.Exec("DELETE FROM api_tokens WHERE user_id=?", actor(r).ID)
	if bad(w, e) {
		return
	}
	if !bad(w, tx.Commit()) {
		s.cookie(w, "", -1)
		plugin.JSON(w, true)
	}
}
func (s *Server) publicAuth(r *http.Request) ([]plugin.AuthForm, []string, bool) {
	mode := s.Store.Setting("mode", "personal")
	forms := []plugin.AuthForm{}
	extensions := []string{}
	passwordReset := false
	all, _ := s.Plugins.List()
	for _, p := range all {
		if !p.Enabled || p.Error != "" {
			continue
		}
		extensions = append(extensions, p.ID)
		caps := map[string]bool{}
		if len(p.Capabilities) > 0 {
			res, e := s.Plugins.Call(r.Context(), p.ID, plugin.Request{Method: "GET", Path: "/_capabilities", Actor: plugin.Actor{Role: "service", Plugin: "core"}})
			if e == nil && res.Status == 200 {
				var data struct {
					Data map[string]bool `json:"data"`
				}
				if json.Unmarshal(res.Body, &data) == nil {
					caps = data.Data
				}
			}
		}
		if caps["auth.password-reset"] {
			passwordReset = true
		}
		for _, form := range p.Auth {
			if len(form.Modes) > 0 && !slices.Contains(form.Modes, mode) {
				continue
			}
			if form.Capability != "" && !caps[form.Capability] {
				continue
			}
			form.Key = p.ID + ":" + form.Key
			form.Path = "/api/v1/extensions/" + p.ID + form.Path
			forms = append(forms, form)
		}
	}
	if !s.onboardingComplete() {
		forms = []plugin.AuthForm{}
	}
	return forms, extensions, passwordReset
}

func (s *Server) setupStatus(w http.ResponseWriter, r *http.Request) {
	mode := s.Store.Setting("mode", "personal")
	forms, extensions, passwordReset := s.publicAuth(r)
	state := s.modeState()
	w.Header().Set("Cache-Control", "no-store")
	plugin.JSON(w, plugin.Record{"initialized": s.initialized(), "name": s.Store.Setting("name", "PxBoard"), "mode": mode, "requestedMode": state.RequestedMode, "needsModeSetup": state.Phase != "ready", "extensions": extensions, "registration": forms, "passwordReset": passwordReset, "adminEntry": s.isAdminEntry(r.URL.Query().Get("entry"))})
}
func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	if s.initialized() {
		plugin.Fail(w, 409, "已经完成初始化")
		return
	}
	var b struct{ Email, Password, Name, Mode, SiteName, PublicURL string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	if b.Mode == "" {
		b.Mode = "personal"
	}
	if !validMode(b.Mode) {
		plugin.Fail(w, 400, "请选择有效的使用方式")
		return
	}
	if len(b.Password) < 10 || !strings.Contains(b.Email, "@") {
		plugin.Fail(w, 400, "请输入有效邮箱和至少 10 位密码")
		return
	}
	if b.Name == "" {
		b.Name = "管理员"
	}
	if b.PublicURL != "" {
		var valid bool
		b.PublicURL, valid = publicOrigin(b.PublicURL)
		if !valid {
			plugin.Fail(w, 400, "公开地址需为完整的 HTTP 或 HTTPS 域名地址")
			return
		}
	}
	if strings.TrimSpace(b.SiteName) == "" {
		b.SiteName = "PxBoard"
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if bad(w, e) {
		return
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	var n int
	_ = tx.QueryRow("SELECT count(*) FROM users WHERE role='admin'").Scan(&n)
	if n > 0 {
		plugin.Fail(w, 409, "已经完成初始化")
		return
	}
	_, e = tx.Exec("INSERT INTO users(id,email,name,password,role,status,created_at)VALUES(?,?,?,?,'admin','active',?)", plugin.ID(), strings.ToLower(strings.TrimSpace(b.Email)), b.Name, string(hash), store.Now())
	if bad(w, e) {
		return
	}
	for key, value := range map[string]string{"mode": "personal", "requested_mode": b.Mode, "name": strings.TrimSpace(b.SiteName), "publicUrl": b.PublicURL, "onboarding_complete": "false"} {
		if _, e = tx.Exec("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value); bad(w, e) {
			return
		}
	}
	if bad(w, tx.Commit()) {
		return
	}
	plugin.JSON(w, plugin.Record{"initialized": true})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var b struct{ Email, Password, Code, ChallengeToken string }
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	if !s.verifyChallenge(w, r, "login", b.ChallengeToken) {
		return
	}
	var a plugin.Actor
	var hash, status string
	e := s.Store.DB.QueryRow("SELECT id,email,role,password,status FROM users WHERE email=?", strings.ToLower(strings.TrimSpace(b.Email))).Scan(&a.ID, &a.Email, &a.Role, &hash, &status)
	valid, mfa := false, false
	if e == nil && status == "active" {
		valid, mfa = s.verifyUser(a.ID, hash, b.Password, b.Code)
	}
	if mfa {
		plugin.FailCode(w, http.StatusUnauthorized, "mfa_required", "请输入动态验证码")
		return
	}
	if !valid {
		plugin.Fail(w, 401, "邮箱或密码不正确")
		return
	}
	token := plugin.ID() + plugin.ID()
	_, e = s.Store.DB.Exec("INSERT INTO sessions VALUES(?,?,?)", token, a.ID, time.Now().Add(7*24*time.Hour).UTC().Format(time.RFC3339))
	if bad(w, e) {
		return
	}
	s.cookie(w, token, 7*24*3600)
	s.Store.Log(a.Email, "auth.login", a.ID)
	plugin.JSON(w, a)
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, e := r.Cookie("px_session"); e == nil {
		_, _ = s.Store.DB.Exec("DELETE FROM sessions WHERE token=?", c.Value)
	}
	s.cookie(w, "", -1)
	plugin.JSON(w, true)
}
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	a := actor(r)
	var name string
	_ = s.Store.DB.QueryRow("SELECT name FROM users WHERE id=?", a.ID).Scan(&name)
	result := plugin.Record{"id": a.ID, "email": a.Email, "role": a.Role, "name": name, "siteName": s.Store.Setting("name", "PxBoard"), "mode": s.Store.Setting("mode", "personal")}
	if a.Role == "admin" {
		result["adminPath"] = s.adminPath()
		result["needsOnboarding"] = !s.onboardingComplete()
	}
	w.Header().Set("Cache-Control", "no-store")
	plugin.JSON(w, result)
}
func (s *Server) userList() ([]plugin.Record, error) {
	rows, e := s.Store.DB.Query("SELECT id,email,name,role,status,created_at FROM users ORDER BY created_at DESC")
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []plugin.Record{}
	for rows.Next() {
		var id, email, name, role, status, created string
		if e = rows.Scan(&id, &email, &name, &role, &status, &created); e != nil {
			return nil, e
		}
		out = append(out, plugin.Record{"id": id, "email": email, "name": name, "role": role, "status": status, "createdAt": created})
	}
	return out, rows.Err()
}
func (s *Server) createUser(b plugin.Record, initialize ...func(*sql.Tx, string) error) (string, error) {
	email := strings.ToLower(strings.TrimSpace(plugin.Text(b, "email")))
	password := plugin.Text(b, "password")
	if !strings.Contains(email, "@") || len(password) < 10 {
		return "", problem("请输入有效邮箱和至少 10 位密码")
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if e != nil {
		return "", e
	}
	id := plugin.ID()
	name := plugin.Text(b, "name")
	if name == "" {
		name = email
	}
	role := plugin.Text(b, "role")
	if role != "admin" {
		role = "member"
	}
	tx, e := s.Store.DB.Begin()
	if e != nil {
		return "", e
	}
	defer tx.Rollback()
	if _, e = tx.Exec("INSERT INTO users VALUES(?,?,?,?,?,'active',?)", id, email, name, string(hash), role, store.Now()); e != nil {
		return "", e
	}
	for _, fn := range initialize {
		if e = fn(tx, id); e != nil {
			return "", e
		}
	}
	return id, tx.Commit()
}
func (s *Server) users(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		if r.URL.Query().Get("limit") != "" {
			s.userPage(w, r)
			return
		}
		out, e := s.userList()
		respond(w, e, out)
		return
	}
	var b plugin.Record
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	if r.Method == "POST" {
		id, e := s.createUser(b)
		if e == nil {
			s.Store.Log(actor(r).Email, "user.create", id)
			_ = s.Plugins.Emit("core", "user.created", plugin.Record{"userId": id})
		}
		respond(w, e, plugin.Record{"id": id})
		return
	}
	id := r.PathValue("id")
	if id == actor(r).ID && (plugin.Text(b, "role") == "member" || plugin.Text(b, "status") == "disabled") {
		plugin.Fail(w, 400, "不能停用或降级当前管理员")
		return
	}
	var oldRole, oldStatus string
	if bad(w, s.Store.DB.QueryRow("SELECT role,status FROM users WHERE id=?", id).Scan(&oldRole, &oldStatus)) {
		return
	}
	role, status := plugin.Text(b, "role"), plugin.Text(b, "status")
	if role == "" {
		role = oldRole
	}
	if status == "" {
		status = oldStatus
	}
	if role != "admin" && role != "member" || status != "active" && status != "disabled" {
		plugin.Fail(w, 400, "角色或状态无效")
		return
	}
	if oldRole == "admin" && oldStatus == "active" && (role != "admin" || status != "active") {
		var count int
		_ = s.Store.DB.QueryRow("SELECT COUNT(*) FROM users WHERE role='admin' AND status='active'").Scan(&count)
		if count <= 1 {
			plugin.Fail(w, 400, "至少保留一个可用管理员")
			return
		}
	}
	var hash []byte
	var e error
	if pass := plugin.Text(b, "password"); pass != "" {
		if len(pass) < 10 {
			plugin.Fail(w, 400, "密码至少 10 位")
			return
		}
		hash, e = bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
		if bad(w, e) {
			return
		}
	}
	tx, e := s.Store.DB.Begin()
	if bad(w, e) {
		return
	}
	defer tx.Rollback()
	_, e = tx.Exec("UPDATE users SET role=?,status=? WHERE id=?", role, status, id)
	if bad(w, e) {
		return
	}
	if len(hash) > 0 {
		_, e = tx.Exec("UPDATE users SET password=? WHERE id=?", string(hash), id)
		if bad(w, e) {
			return
		}
		_, e = tx.Exec("DELETE FROM api_tokens WHERE user_id=?", id)
		if bad(w, e) {
			return
		}
	}
	_, e = tx.Exec("DELETE FROM sessions WHERE user_id=?", id)
	if bad(w, e) {
		return
	}
	if bad(w, tx.Commit()) {
		return
	}
	s.Store.Log(actor(r).Email, "user.update", id)
	plugin.JSON(w, true)
}
