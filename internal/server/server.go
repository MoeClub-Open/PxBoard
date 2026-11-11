package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Server struct {
	Store                  *store.Store
	Plugins                *plugins.Manager
	Web, PublicURL         string
	Secure                 bool
	DefaultPluginSource    string
	DefaultPluginPublicKey string
	modeMu                 sync.Mutex
	modeWorking            bool
}

const Version = plugin.CoreVersion

type actorContext struct{}

func actor(r *http.Request) plugin.Actor {
	a, _ := r.Context().Value(actorContext{}).(plugin.Actor)
	return a
}
func (s *Server) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("POST /rpc/v1/$batch", s.rpcBatch)
	m.HandleFunc("GET /rpc/v1/schema.json", s.rpcSchema)
	m.HandleFunc("POST /rpc/v1/{service}/{method...}", s.rpc)
	m.HandleFunc("/rpc/", func(w http.ResponseWriter, r *http.Request) { plugin.Fail(w, 404, "接口不存在") })
	m.HandleFunc("GET /robots.txt", s.robots)
	m.HandleFunc("GET /sitemap.xml", s.sitemap)
	m.HandleFunc("/api/v1/runtime/{path...}", s.runtime)
	m.HandleFunc("GET /api/v1/extensions/subscriptions/s/{token}", func(w http.ResponseWriter, r *http.Request) {
		s.serveExternalPlugin(w, r, "subscriptions", "/s/"+url.PathEscape(r.PathValue("token")), false)
	})
	m.HandleFunc("GET /api/v1/extensions/oauth/callback/{provider}", func(w http.ResponseWriter, r *http.Request) {
		s.serveExternalPlugin(w, r, "oauth", "/callback/"+url.PathEscape(r.PathValue("provider")), false)
	})
	m.HandleFunc("GET /api/v1/extensions/payments/webhooks/{id}", func(w http.ResponseWriter, r *http.Request) {
		s.serveExternalPlugin(w, r, "payments", "/webhooks/"+url.PathEscape(r.PathValue("id")), false)
	})
	m.HandleFunc("POST /api/v1/extensions/payments/webhooks/{id}", func(w http.ResponseWriter, r *http.Request) {
		s.serveExternalPlugin(w, r, "payments", "/webhooks/"+url.PathEscape(r.PathValue("id")), false)
	})
	m.HandleFunc("GET /files/{plugin}/{path...}", func(w http.ResponseWriter, r *http.Request) {
		s.serveExternalPlugin(w, r, r.PathValue("plugin"), "/"+r.PathValue("path"), true)
	})
	m.HandleFunc("GET /api/v1/extensions/support/attachments/{id}", func(w http.ResponseWriter, r *http.Request) {
		s.serveExternalPlugin(w, r, "support", "/attachments/"+url.PathEscape(r.PathValue("id")), true)
	})
	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { plugin.Fail(w, 404, "接口不存在") })
	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if s.publicRoute(w, r) {
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			http.NotFound(w, r)
			return
		}
		if s.adminPath() != "/admin" && (r.URL.Path == "/admin" || strings.HasPrefix(r.URL.Path, "/admin/")) {
			http.NotFound(w, r)
			return
		}
		path := filepath.Join(s.Web, filepath.Clean("/"+r.URL.Path))
		if stat, e := os.Stat(path); e == nil && !stat.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
		known := r.URL.Path == "/" || r.URL.Path == "/login" || r.URL.Path == "/register" || r.URL.Path == "/forgot" || r.URL.Path == "/reset" || r.URL.Path == "/setup" || r.URL.Path == "/auth/external" || r.URL.Path == "/user" || strings.HasPrefix(r.URL.Path, "/user/") || s.isAdminEntry(r.URL.Path)
		if !known {
			http.NotFound(w, r)
			return
		}
		s.serveDocument(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if e := recover(); e != nil {
				log.Printf("request panic: %v", e)
				plugin.Fail(w, 500, "处理请求失败")
			}
		}()
		w.Header().Set("X-Request-ID", plugin.ID())
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		if r.Method != "GET" && r.Method != "HEAD" && r.Header.Get("Authorization") == "" {
			origin := r.Header.Get("Origin")
			if origin != "" {
				expected := s.PublicURL
				if expected == "" {
					expected = s.Store.Setting("publicUrl", "")
				}
				if expected == "" {
					scheme := "http"
					if r.TLS != nil {
						scheme = "https"
					}
					expected = scheme + "://" + r.Host
				}
				if origin != strings.TrimSuffix(expected, "/") {
					plugin.Fail(w, 403, "请求来源不匹配")
					return
				}
			}
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
		m.ServeHTTP(w, r)
	})
}
func requestToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	token := ""
	if strings.HasPrefix(auth, "Bearer ") {
		token = strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	}
	if token == "" {
		if c, e := r.Cookie("px_session"); e == nil {
			token = c.Value
		}
	}
	return token
}
func (s *Server) authenticate(r *http.Request) (plugin.Actor, bool) {
	hasBearer := strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ")
	token := requestToken(r)
	if token == "" {
		return plugin.Actor{}, false
	}
	if token != "" {
		if id, ok := s.Plugins.Authenticate(token); ok {
			return plugin.Actor{Role: "service", Plugin: id}, true
		}
	}
	if strings.HasPrefix(token, "px_") {
		return s.tokenActor(token)
	}
	var a plugin.Actor
	e := s.Store.DB.QueryRow("SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.status='active'", token, store.Now()).Scan(&a.ID, &a.Email, &a.Name, &a.Role)
	if e == nil {
		return a, true
	}
	if hasBearer {
		return s.machineActor(token)
	}
	return plugin.Actor{}, false
}
func (s *Server) machineActor(token string) (plugin.Actor, bool) {
	var matchNumber int64
	secret := token
	if strings.HasPrefix(token, "pxm_") {
		parts := strings.SplitN(strings.TrimPrefix(token, "pxm_"), ".", 2)
		if len(parts) != 2 || parts[1] == "" {
			return plugin.Actor{}, false
		}
		num, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || num <= 0 {
			return plugin.Actor{}, false
		}
		matchNumber = num
		secret = parts[1]
	}
	if secret == "" {
		return plugin.Actor{}, false
	}
	rows, err := s.Store.DB.Query("SELECT id,data FROM documents WHERE namespace='nodes' AND collection='machines'")
	if err != nil {
		return plugin.Actor{}, false
	}
	defer rows.Close()
	var matched plugin.Actor
	found := false
	for rows.Next() {
		var docID, raw string
		if rows.Scan(&docID, &raw) != nil {
			continue
		}
		var row plugin.Record
		if json.Unmarshal([]byte(raw), &row) != nil || !plugin.Bool(row, "enabled") {
			continue
		}
		num := int64(plugin.Number(row, "number"))
		if num <= 0 || (matchNumber > 0 && num != matchNumber) {
			continue
		}
		key := plugin.Text(row, "key")
		if key != "" && subtle.ConstantTimeCompare([]byte(key), []byte(secret)) == 1 {
			matched = plugin.Actor{ID: docID, Name: plugin.Text(row, "name"), Role: "machine", MachineID: num}
			found = true
		}
	}
	return matched, found
}
func (s *Server) require(next http.HandlerFunc, admin bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, ok := s.authenticate(r)
		if !ok {
			plugin.Fail(w, 401, "请先登录")
			return
		}
		if a.Role == "service" || a.Role == "machine" || (admin && a.Role != "admin") || (a.Scope == "read" && r.Method != "GET") {
			plugin.Fail(w, 403, "权限不足")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), actorContext{}, a)))
	}
}
func (s *Server) cookie(w http.ResponseWriter, token string, age int) {
	http.SetCookie(w, &http.Cookie{Name: "px_session", Value: token, Path: "/", MaxAge: age, Expires: time.Now().Add(time.Duration(age) * time.Second), HttpOnly: true, Secure: s.Secure, SameSite: http.SameSiteStrictMode})
}
func respond(w http.ResponseWriter, err error, data any) {
	if err != nil {
		plugin.Fail(w, 400, err.Error())
		return
	}
	plugin.JSON(w, data)
}
func bad(w http.ResponseWriter, err error) bool {
	if err != nil {
		plugin.Fail(w, 400, err.Error())
		return true
	}
	return false
}
func forbidden(w http.ResponseWriter, message string) { plugin.Fail(w, 403, message) }
func problem(message string) error                    { return fmt.Errorf("%s", message) }
