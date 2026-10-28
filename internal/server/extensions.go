package server

import (
	"database/sql"
	"encoding/json"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"io"
	"net/http"
	"slices"
	"strings"
)

func (s *Server) extension(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("plugin")
	p, e := s.Plugins.Get(id)
	if e != nil || !p.Enabled {
		plugin.Fail(w, 404, "插件未启用")
		return
	}
	path := "/" + r.PathValue("path")
	if strings.HasPrefix(path, "/_") {
		forbidden(w, "内部接口不可公开访问")
		return
	}
	a, ok := s.authenticate(r)
	public := false
	for _, prefix := range p.PublicPaths {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			public = true
		}
	}
	if !ok && !public {
		plugin.Fail(w, 401, "请先登录")
		return
	}
	if a.Role == "service" && !s.Plugins.Permission(a.Plugin, "call:"+id) {
		forbidden(w, "插件未获跨插件调用权限")
		return
	}
	if !ok {
		a = plugin.Actor{Role: "guest"}
	}
	if a.Scope == "read" && r.Method != "GET" {
		forbidden(w, "此 API 密钥仅允许读取")
		return
	}
	if strings.HasPrefix(path, "/ui/") {
		allowed := false
		caps := s.pageCapabilities(r, p.Manifest, a.Role)
		for _, page := range p.Pages {
			if page.ID == strings.TrimPrefix(path, "/ui/") && pageAllowed(page, a.Role, caps) {
				allowed = true
			}
		}
		if !allowed {
			forbidden(w, "无权访问此页面")
			return
		}
	}
	if r.URL.RawQuery != "" {
		path += "?" + r.URL.RawQuery
	}
	body, e := io.ReadAll(r.Body)
	if bad(w, e) {
		return
	}
	if r.Method == "POST" && public && a.Role != "service" {
		requestPath := "/" + r.PathValue("path")
		action := ""
		for _, form := range p.Auth {
			if form.Path == requestPath {
				action = "register"
				break
			}
		}
		if action == "" && requestPath == "/authorize" && slices.Contains(p.Permissions, "auth:login") {
			action = "oauth"
		}
		if action != "" {
			var challenge struct{ Purpose, ChallengeToken string }
			if json.Unmarshal(body, &challenge) != nil {
				plugin.Fail(w, 400, "请求格式无效")
				return
			}
			if action != "oauth" || challenge.Purpose != "bind" {
				if !s.verifyChallenge(w, r, action, challenge.ChallengeToken) {
					return
				}
			}
		}
	}

	headers := r.Header.Clone()
	headers.Del("Authorization")
	headers.Del("Cookie")
	res, e := s.Plugins.Call(r.Context(), id, plugin.Request{Method: r.Method, Path: path, Body: body, Headers: headers, Actor: a, Host: r.Host})
	if e != nil {
		plugin.Fail(w, 503, e.Error())
		return
	}
	for k, v := range res.Headers {
		if k != "Set-Cookie" && k != "Access-Control-Allow-Origin" {
			w.Header()[k] = v
		}
	}
	w.WriteHeader(res.Status)
	_, _ = w.Write(res.Body)
}
func (s *Server) runtime(w http.ResponseWriter, r *http.Request) {
	a, ok := s.authenticate(r)
	if !ok || a.Role != "service" {
		forbidden(w, "需要插件运行凭据")
		return
	}
	path := r.PathValue("path")
	switch {
	case path == "challenge" && r.Method == "GET", path == "challenge/verify" && r.Method == "POST":
		s.runtimeChallenge(w, r, a)
	case path == "auth/grants" && r.Method == "POST":
		s.createLoginGrant(w, r, a)
	case path == "auth/verify" && r.Method == "POST":
		s.verifyExternalCredential(w, r, a)
	case path == "batch" && r.Method == "POST":
		s.batchRuntime(w, r, a)
	case path == "commit" && r.Method == "POST":
		s.commitRuntime(w, r, a)
	case strings.HasPrefix(path, "import/"):
		s.importRuntime(w, r, a, strings.TrimPrefix(path, "import/"))
	case path == "query" && r.Method == "POST":
		s.queryRuntime(w, r, a)
	case path == "increment" && r.Method == "POST":
		if !s.Plugins.Permission(a.Plugin, "storage:own") {
			forbidden(w, "未获存储权限")
			return
		}
		var b plugin.Record
		if bad(w, plugin.Decode(r, &b)) {
			return
		}
		if plugin.Text(b, "operationId") == "" || plugin.Text(b, "field") == "id" {
			plugin.Fail(w, 400, "计数操作标识或字段无效")
			return
		}
		row, e := s.Store.Increment(a.Plugin, plugin.Text(b, "collection"), plugin.Text(b, "id"), plugin.Text(b, "field"), plugin.Number(b, "amount"), plugin.Text(b, "operationId"))
		respond(w, e, row)
	case path == "users" && r.Method == "GET":
		if !s.Plugins.Permission(a.Plugin, "users:read") {
			forbidden(w, "未获用户读取权限")
			return
		}
		out, e := s.userList()
		respond(w, e, out)
	case path == "users/query" && r.Method == "POST":
		s.queryUsers(w, r, a)
	case path == "users/search" && r.Method == "POST":
		s.searchUsers(w, r, a)
	case path == "users" && r.Method == "POST":
		if !s.Plugins.Permission(a.Plugin, "users:create") {
			forbidden(w, "未获用户创建权限")
			return
		}
		var b plugin.Record
		if bad(w, plugin.Decode(r, &b)) {
			return
		}
		b["role"] = "member"
		id, e := s.createRuntimeUser(a.Plugin, b)
		if e == nil {
			_ = s.Plugins.Emit("core", "user.created", plugin.Record{"userId": id})
		}
		respond(w, e, plugin.Record{"id": id})
	case strings.HasPrefix(path, "data/"):
		if !s.Plugins.Permission(a.Plugin, "storage:own") {
			forbidden(w, "未获存储权限")
			return
		}
		parts := strings.Split(strings.TrimPrefix(path, "data/"), "/")
		collection := parts[0]
		if collection == "" {
			plugin.Fail(w, 400, "缺少集合名称")
			return
		}
		switch r.Method {
		case "GET":
			if len(parts) == 2 {
				record, e := s.Store.Get(a.Plugin, collection, parts[1])
				if e == sql.ErrNoRows {
					plugin.Fail(w, 404, "记录不存在")
					return
				}
				respond(w, e, record)
				return
			}
			records, e := s.Store.List(a.Plugin, collection)
			respond(w, e, records)
		case "PUT":
			if len(parts) != 2 {
				plugin.Fail(w, 400, "缺少记录标识")
				return
			}
			var b plugin.Record
			if bad(w, plugin.Decode(r, &b)) {
				return
			}
			b["id"] = parts[1]
			tx, e := s.Store.DB.Begin()
			if bad(w, e) {
				return
			}
			defer tx.Rollback()
			if bad(w, s.validatePublicRoute(tx, a.Plugin, collection, b)) {
				return
			}
			if bad(w, store.Put(tx, a.Plugin, collection, parts[1], b)) {
				return
			}
			respond(w, tx.Commit(), b)
		case "DELETE":
			if len(parts) != 2 {
				plugin.Fail(w, 400, "缺少记录标识")
				return
			}
			respond(w, s.Store.Delete(a.Plugin, collection, parts[1]), true)
		default:
			plugin.Fail(w, 405, "不支持的操作")
		}
	case path == "events" && r.Method == "POST":
		var b struct {
			Type string        `json:"type"`
			Data plugin.Record `json:"data"`
		}
		if bad(w, plugin.Decode(r, &b)) {
			return
		}
		if !s.Plugins.Permission(a.Plugin, "emit:"+b.Type) {
			forbidden(w, "未获事件发布权限")
			return
		}
		respond(w, s.Plugins.Emit(a.Plugin, b.Type, b.Data), plugin.Record{"queuedAt": store.Now()})
	default:
		plugin.Fail(w, 404, "运行接口不存在")
	}
}
