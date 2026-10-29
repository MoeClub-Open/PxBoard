package server

import (
	"context"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"log"
	"net/http"
	"os"
	"path/filepath"
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
	m.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		plugin.JSON(w, plugin.Record{"status": "ok", "version": Version, "pluginApi": "1.0"})
	})
	m.HandleFunc("GET /api/v1/setup", s.setupStatus)
	m.HandleFunc("POST /api/v1/setup", s.setup)
	m.HandleFunc("GET /api/v1/site", s.publicSite)
	m.HandleFunc("POST /api/v1/onboarding/complete", s.require(s.completeOnboarding, true))
	m.HandleFunc("GET /robots.txt", s.robots)
	m.HandleFunc("GET /sitemap.xml", s.sitemap)
	m.HandleFunc("GET /api/v1/auth/challenge", s.challengeConfig)
	m.HandleFunc("POST /api/v1/auth/login", s.login)
	m.HandleFunc("POST /api/v1/auth/native", s.nativeRequest)
	m.HandleFunc("GET /api/v1/auth/native/{id}", s.nativeStatus)
	m.HandleFunc("POST /api/v1/auth/native/{id}/approve", s.require(s.nativeApprove, false))
	m.HandleFunc("POST /api/v1/auth/native/{id}/token", s.nativeToken)
	m.HandleFunc("POST /api/v1/auth/browser-link", s.require(s.browserLink, false))
	m.HandleFunc("POST /api/v1/auth/browser-link/complete", s.completeBrowserLink)
	m.HandleFunc("POST /api/v1/auth/external/complete", s.completeExternalLogin)
	m.HandleFunc("POST /api/v1/auth/logout", s.logout)
	m.HandleFunc("POST /api/v1/auth/reset-request", s.resetRequest)
	m.HandleFunc("POST /api/v1/auth/reset", s.resetPassword)
	m.HandleFunc("GET /api/v1/me", s.require(s.me, false))
	m.HandleFunc("POST /api/v1/me/password", s.require(s.changePassword, false))
	m.HandleFunc("GET /api/v1/tokens", s.require(s.tokens, false))
	m.HandleFunc("POST /api/v1/tokens", s.require(s.tokens, false))
	m.HandleFunc("DELETE /api/v1/tokens/{id}", s.require(s.tokens, false))
	m.HandleFunc("GET /api/v1/overview", s.require(s.overview, false))
	m.HandleFunc("GET /api/v1/settings", s.require(s.settings, true))
	m.HandleFunc("PATCH /api/v1/settings", s.require(s.settings, true))
	m.HandleFunc("GET /api/v1/mode", s.require(s.workspaceMode, true))
	m.HandleFunc("POST /api/v1/mode", s.require(s.workspaceMode, true))
	m.HandleFunc("GET /api/v1/users", s.require(s.users, true))
	m.HandleFunc("GET /api/v1/users/options", s.require(s.userOptions, true))
	m.HandleFunc("POST /api/v1/users", s.require(s.users, true))
	m.HandleFunc("PATCH /api/v1/users/{id}", s.require(s.users, true))
	m.HandleFunc("GET /api/v1/plugins", s.require(s.listPlugins, false))
	m.HandleFunc("GET /api/v1/plugins/catalog", s.require(s.catalog, true))
	m.HandleFunc("POST /api/v1/plugins/install", s.require(s.install, true))
	m.HandleFunc("POST /api/v1/plugins/{id}/{action}", s.require(s.pluginAction, true))
	m.HandleFunc("DELETE /api/v1/plugins/{id}", s.require(s.pluginAction, true))
	m.HandleFunc("GET /api/v1/sources", s.require(s.sources, true))
	m.HandleFunc("POST /api/v1/sources", s.require(s.sources, true))
	m.HandleFunc("PATCH /api/v1/sources/{id}", s.require(s.sources, true))
	m.HandleFunc("DELETE /api/v1/sources/{id}", s.require(s.sources, true))
	m.HandleFunc("GET /api/v1/activity", s.require(s.activity, true))
	m.HandleFunc("GET /api/v1/jobs", s.require(s.jobs, true))
	m.HandleFunc("POST /api/v1/jobs/{id}/retry", s.require(s.retryJob, true))
	m.HandleFunc("/api/v1/extensions/{plugin}/{path...}", s.extension)
	m.HandleFunc("/api/v1/runtime/{path...}", s.runtime)
	m.HandleFunc("GET /api/v1/openapi.json", s.openapi)
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
		if r.Method != "GET" && r.Method != "HEAD" {
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
func (s *Server) authenticate(r *http.Request) (plugin.Actor, bool) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		if c, e := r.Cookie("px_session"); e == nil {
			token = c.Value
		}
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
	e := s.Store.DB.QueryRow("SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.status='active'", token, store.Now()).Scan(&a.ID, &a.Email, &a.Role)
	return a, e == nil
}
func (s *Server) require(next http.HandlerFunc, admin bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, ok := s.authenticate(r)
		if !ok {
			plugin.Fail(w, 401, "请先登录")
			return
		}
		if a.Role == "service" || (admin && a.Role != "admin") || (a.Scope == "read" && r.Method != "GET") {
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
