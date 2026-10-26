package server

import (
	"crypto/sha256"
	"encoding/hex"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"net/http"
	"strings"
	"time"
)

func digest(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}
func (s *Server) tokens(w http.ResponseWriter, r *http.Request) {
	user := actor(r)
	if r.Method == "DELETE" {
		_, e := s.Store.DB.Exec("DELETE FROM api_tokens WHERE id=? AND user_id=?", r.PathValue("id"), user.ID)
		respond(w, e, true)
		return
	}
	if r.Method == "POST" {
		var b struct{ Name, Scope, ExpiresAt string }
		if bad(w, plugin.Decode(r, &b)) {
			return
		}
		if b.Name == "" {
			plugin.Fail(w, 400, "请填写名称")
			return
		}
		if b.Scope != "write" {
			b.Scope = "read"
		}
		if b.ExpiresAt == "" {
			b.ExpiresAt = time.Now().AddDate(0, 3, 0).UTC().Format(time.RFC3339)
		}
		expires, e := time.Parse(time.RFC3339, b.ExpiresAt)
		if e != nil || expires.Before(time.Now()) {
			plugin.Fail(w, 400, "到期时间无效")
			return
		}
		id, secret := plugin.ID(), plugin.ID()+plugin.ID()
		token := "px_" + id + "." + secret
		_, e = s.Store.DB.Exec("INSERT INTO api_tokens VALUES(?,?,?,?,?,?,?)", id, user.ID, b.Name, digest(secret), b.Scope, b.ExpiresAt, store.Now())
		respond(w, e, plugin.Record{"id": id, "token": token})
		return
	}
	rows, e := s.Store.DB.Query("SELECT id,name,scope,expires_at,created_at FROM api_tokens WHERE user_id=? ORDER BY created_at DESC", user.ID)
	if bad(w, e) {
		return
	}
	defer rows.Close()
	out := []plugin.Record{}
	for rows.Next() {
		var id, name, scope, expires, created string
		if rows.Scan(&id, &name, &scope, &expires, &created) == nil {
			out = append(out, plugin.Record{"id": id, "name": name, "scope": scope, "expiresAt": expires, "createdAt": created})
		}
	}
	plugin.JSON(w, out)
}
func (s *Server) tokenActor(token string) (plugin.Actor, bool) {
	parts := strings.SplitN(strings.TrimPrefix(token, "px_"), ".", 2)
	if len(parts) != 2 {
		return plugin.Actor{}, false
	}
	var a plugin.Actor
	e := s.Store.DB.QueryRow("SELECT u.id,u.email,u.role,t.scope FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.digest=? AND t.expires_at>? AND u.status='active'", parts[0], digest(parts[1]), store.Now()).Scan(&a.ID, &a.Email, &a.Role, &a.Scope)
	return a, e == nil
}
