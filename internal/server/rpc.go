package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync"

	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

const maxBatchCalls = 32

type rpcBatchItem struct {
	Key     string          `json:"key"`
	Service string          `json:"service"`
	Method  string          `json:"method"`
	Input   json.RawMessage `json:"input"`
}

func (s *Server) rpc(w http.ResponseWriter, r *http.Request) {
	service := strings.TrimSpace(r.PathValue("service"))
	method := plugin.NormalizeProcedure(r.PathValue("method"))
	if service == "" || method == "" {
		plugin.Fail(w, http.StatusNotFound, "接口不存在")
		return
	}
	rawBody, err := io.ReadAll(r.Body)
	if bad(w, err) {
		return
	}
	if len(bytes.TrimSpace(rawBody)) == 0 {
		rawBody = []byte("{}")
	}
	a, authed := s.authenticate(r)
	s.dispatchRPC(w, r, service, method, rawBody, a, authed)
}

func (s *Server) rpcBatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Calls []rpcBatchItem `json:"calls"`
	}
	if bad(w, plugin.Decode(r, &req)) {
		return
	}
	if len(req.Calls) == 0 || len(req.Calls) > maxBatchCalls {
		plugin.Fail(w, http.StatusBadRequest, "批量请求数量需在 1 到 32 之间")
		return
	}
	seen := make(map[string]bool, len(req.Calls))
	for i := range req.Calls {
		item := &req.Calls[i]
		item.Key = strings.TrimSpace(item.Key)
		item.Service = strings.TrimSpace(item.Service)
		item.Method = plugin.NormalizeProcedure(item.Method)
		if item.Key == "" || item.Service == "" || item.Method == "" || seen[item.Key] {
			plugin.Fail(w, http.StatusBadRequest, "批量调用标识或目标无效")
			return
		}
		seen[item.Key] = true
		if len(bytes.TrimSpace(item.Input)) == 0 || string(bytes.TrimSpace(item.Input)) == "null" {
			item.Input = json.RawMessage("{}")
		}
	}
	a, authed := s.authenticate(r)
	results := make([]plugin.Record, len(req.Calls))
	cookies := make([][]*http.Cookie, len(req.Calls))

	execOne := func(idx int) {
		item := req.Calls[idx]
		rec := httptest.NewRecorder()
		sub := r.Clone(r.Context())
		sub.Body = io.NopCloser(bytes.NewReader(item.Input))
		s.dispatchRPC(rec, sub, item.Service, item.Method, item.Input, a, authed)
		res := rec.Result()
		cookies[idx] = res.Cookies()
		var envelope struct {
			Data  any `json:"data"`
			Error any `json:"error"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &envelope)
		if rec.Code >= 400 {
			errVal := envelope.Error
			if errVal == nil {
				errVal = plugin.Record{"code": http.StatusText(rec.Code), "message": "请求失败"}
			}
			results[idx] = plugin.Record{"status": rec.Code, "error": errVal}
		} else {
			results[idx] = plugin.Record{"status": rec.Code, "data": envelope.Data}
		}
	}

	var wg sync.WaitGroup
	for i, item := range req.Calls {
		if plugin.IsReadProcedure(item.Method) {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				execOne(idx)
			}(i)
		}
	}
	wg.Wait()
	for i, item := range req.Calls {
		if !plugin.IsReadProcedure(item.Method) {
			execOne(i)
		}
	}
	for _, list := range cookies {
		for _, c := range list {
			http.SetCookie(w, c)
		}
	}
	out := make(map[string]plugin.Record, len(req.Calls))
	for i, item := range req.Calls {
		out[item.Key] = results[i]
	}
	w.Header().Set("Cache-Control", "no-store")
	plugin.JSON(w, out)
}

func (s *Server) dispatchRPC(w http.ResponseWriter, r *http.Request, service, method string, rawBody []byte, a plugin.Actor, authed bool) {
	if service == "core" {
		s.dispatchCoreRPC(w, r, method, rawBody, a, authed)
		return
	}
	s.dispatchPluginRPC(w, r, service, method, rawBody, a, authed)
}

func (s *Server) dispatchCoreRPC(w http.ResponseWriter, r *http.Request, method string, rawBody []byte, a plugin.Actor, authed bool) {
	if a.Role == "machine" || a.Role == "service" {
		forbidden(w, "权限不足")
		return
	}
	var input map[string]any
	dec := json.NewDecoder(bytes.NewReader(rawBody))
	dec.UseNumber()
	if dec.Decode(&input) != nil {
		plugin.Fail(w, http.StatusBadRequest, "请求格式无效")
		return
	}
	if input == nil {
		input = map[string]any{}
	}
	str := func(key string) string {
		switch v := input[key].(type) {
		case string:
			return strings.TrimSpace(v)
		case json.Number:
			return v.String()
		case float64:
			return fmt.Sprintf("%.0f", v)
		}
		return ""
	}
	requireMember := func() bool {
		if !authed || (a.Role != "member" && a.Role != "admin") {
			plugin.Fail(w, http.StatusUnauthorized, "请先登录")
			return false
		}
		if a.Scope == "read" && !plugin.IsReadProcedure(method) {
			forbidden(w, "权限不足")
			return false
		}
		return true
	}
	requireAdmin := func() bool {
		if !requireMember() {
			return false
		}
		if a.Role != "admin" {
			forbidden(w, "权限不足")
			return false
		}
		return true
	}
	makeReq := func(httpMethod, path string, query url.Values) *http.Request {
		target := path
		if len(query) > 0 {
			target += "?" + query.Encode()
		}
		sub := r.Clone(context.WithValue(r.Context(), actorContext{}, a))
		sub.Method = httpMethod
		u, _ := url.ParseRequestURI(target)
		if u != nil {
			sub.URL = u
		}
		sub.Body = io.NopCloser(bytes.NewReader(rawBody))
		return sub
	}
	requireID := func() (string, bool) {
		id := str("id")
		if id == "" {
			plugin.Fail(w, http.StatusBadRequest, "缺少记录标识")
			return "", false
		}
		return id, true
	}

	switch method {
	case "health":
		plugin.JSON(w, plugin.Record{"status": "ok", "version": Version, "pluginApi": "1.0", "rpcVersion": "1.0"})
	case "setup.get":
		q := url.Values{}
		if entry := str("entry"); entry != "" {
			q.Set("entry", entry)
		}
		s.setupStatus(w, makeReq(http.MethodGet, "/setup", q))
	case "setup.init":
		s.setup(w, makeReq(http.MethodPost, "/setup", nil))
	case "site.get":
		s.publicSite(w, makeReq(http.MethodGet, "/site", nil))
	case "onboarding.complete":
		if requireAdmin() {
			s.completeOnboarding(w, makeReq(http.MethodPost, "/onboarding/complete", nil))
		}
	case "auth.challenge":
		s.challengeConfig(w, makeReq(http.MethodGet, "/auth/challenge", nil))
	case "auth.login":
		s.login(w, makeReq(http.MethodPost, "/auth/login", nil))
	case "auth.logout":
		s.logout(w, makeReq(http.MethodPost, "/auth/logout", nil))
	case "auth.resetRequest":
		s.resetRequest(w, makeReq(http.MethodPost, "/auth/reset-request", nil))
	case "auth.resetPassword":
		s.resetPassword(w, makeReq(http.MethodPost, "/auth/reset", nil))
	case "auth.authorizeCreate":
		s.nativeRequest(w, makeReq(http.MethodPost, "/auth/native", nil))
	case "auth.authorizeStatus":
		if id, ok := requireID(); ok {
			req := makeReq(http.MethodGet, "/auth/native/"+url.PathEscape(id), nil)
			req.SetPathValue("id", id)
			s.nativeStatus(w, req)
		}
	case "auth.authorizeApprove":
		if requireMember() {
			if id, ok := requireID(); ok {
				req := makeReq(http.MethodPost, "/auth/native/"+url.PathEscape(id)+"/approve", nil)
				req.SetPathValue("id", id)
				s.nativeApprove(w, req)
			}
		}
	case "auth.authorizeExchange":
		if id, ok := requireID(); ok {
			req := makeReq(http.MethodPost, "/auth/native/"+url.PathEscape(id)+"/token", nil)
			req.SetPathValue("id", id)
			s.nativeToken(w, req)
		}
	case "auth.browserLink":
		if requireMember() {
			s.browserLink(w, makeReq(http.MethodPost, "/auth/browser-link", nil))
		}
	case "auth.browserExchange":
		s.completeBrowserLink(w, makeReq(http.MethodPost, "/auth/browser-link/complete", nil))
	case "auth.externalComplete":
		s.completeExternalLogin(w, makeReq(http.MethodPost, "/auth/external/complete", nil))
	case "account.me":
		if requireMember() {
			s.me(w, makeReq(http.MethodGet, "/me", nil))
		}
	case "account.changePassword":
		if requireMember() {
			s.changePassword(w, makeReq(http.MethodPost, "/me/password", nil))
		}
	case "tokens.list":
		if requireMember() {
			s.tokens(w, makeReq(http.MethodGet, "/tokens", nil))
		}
	case "tokens.create":
		if requireMember() {
			s.tokens(w, makeReq(http.MethodPost, "/tokens", nil))
		}
	case "tokens.revoke", "tokens.delete":
		if requireMember() {
			if id, ok := requireID(); ok {
				req := makeReq(http.MethodDelete, "/tokens/"+url.PathEscape(id), nil)
				req.SetPathValue("id", id)
				s.tokens(w, req)
			}
		}
	case "overview.get":
		if requireMember() {
			s.overview(w, makeReq(http.MethodGet, "/overview", nil))
		}
	case "settings.get":
		if requireAdmin() {
			s.settings(w, makeReq(http.MethodGet, "/settings", nil))
		}
	case "settings.update":
		if requireAdmin() {
			s.settings(w, makeReq(http.MethodPatch, "/settings", nil))
		}
	case "mode.get":
		if requireAdmin() {
			s.workspaceMode(w, makeReq(http.MethodGet, "/mode", nil))
		}
	case "mode.apply":
		if requireAdmin() {
			s.workspaceMode(w, makeReq(http.MethodPost, "/mode", nil))
		}
	case "users.list":
		if requireAdmin() {
			q := url.Values{}
			for _, k := range []string{"limit", "offset", "q"} {
				if v := str(k); v != "" {
					q.Set(k, v)
				}
			}
			s.users(w, makeReq(http.MethodGet, "/users", q))
		}
	case "users.options":
		if requireAdmin() {
			q := url.Values{}
			for _, k := range []string{"q", "id"} {
				if v := str(k); v != "" {
					q.Set(k, v)
				}
			}
			s.userOptions(w, makeReq(http.MethodGet, "/users/options", q))
		}
	case "users.create":
		if requireAdmin() {
			s.users(w, makeReq(http.MethodPost, "/users", nil))
		}
	case "users.update":
		if requireAdmin() {
			if id, ok := requireID(); ok {
				req := makeReq(http.MethodPatch, "/users/"+url.PathEscape(id), nil)
				req.SetPathValue("id", id)
				s.users(w, req)
			}
		}
	case "plugins.list":
		if requireMember() {
			s.listPlugins(w, makeReq(http.MethodGet, "/plugins", nil))
		}
	case "plugins.catalog":
		if requireAdmin() {
			s.catalog(w, makeReq(http.MethodGet, "/plugins/catalog", nil))
		}
	case "plugins.install":
		if requireAdmin() {
			s.install(w, makeReq(http.MethodPost, "/plugins/install", nil))
		}
	case "plugins.action":
		if requireAdmin() {
			if id, ok := requireID(); ok {
				act := str("action")
				if act == "remove" {
					req := makeReq(http.MethodDelete, "/plugins/"+url.PathEscape(id), nil)
					req.SetPathValue("id", id)
					s.pluginAction(w, req)
				} else {
					req := makeReq(http.MethodPost, "/plugins/"+url.PathEscape(id)+"/"+url.PathEscape(act), nil)
					req.SetPathValue("id", id)
					req.SetPathValue("action", act)
					s.pluginAction(w, req)
				}
			}
		}
	case "plugins.remove", "plugins.delete":
		if requireAdmin() {
			if id, ok := requireID(); ok {
				req := makeReq(http.MethodDelete, "/plugins/"+url.PathEscape(id), nil)
				req.SetPathValue("id", id)
				s.pluginAction(w, req)
			}
		}
	case "sources.list":
		if requireAdmin() {
			s.sources(w, makeReq(http.MethodGet, "/sources", nil))
		}
	case "sources.create":
		if requireAdmin() {
			s.sources(w, makeReq(http.MethodPost, "/sources", nil))
		}
	case "sources.update":
		if requireAdmin() {
			if id, ok := requireID(); ok {
				req := makeReq(http.MethodPatch, "/sources/"+url.PathEscape(id), nil)
				req.SetPathValue("id", id)
				s.sources(w, req)
			}
		}
	case "sources.remove", "sources.delete":
		if requireAdmin() {
			if id, ok := requireID(); ok {
				req := makeReq(http.MethodDelete, "/sources/"+url.PathEscape(id), nil)
				req.SetPathValue("id", id)
				s.sources(w, req)
			}
		}
	case "activity.list":
		if requireAdmin() {
			s.activity(w, makeReq(http.MethodGet, "/activity", nil))
		}
	case "jobs.list":
		if requireAdmin() {
			s.jobs(w, makeReq(http.MethodGet, "/jobs", nil))
		}
	case "jobs.retry":
		if requireAdmin() {
			if id, ok := requireID(); ok {
				req := makeReq(http.MethodPost, "/jobs/"+url.PathEscape(id)+"/retry", nil)
				req.SetPathValue("id", id)
				s.retryJob(w, req)
			}
		}
	default:
		plugin.Fail(w, http.StatusNotFound, "接口不存在")
	}
}

func (s *Server) dispatchPluginRPC(w http.ResponseWriter, r *http.Request, id, method string, rawBody []byte, a plugin.Actor, authed bool) {
	p, e := s.Plugins.Get(id)
	if e != nil || !p.Enabled {
		plugin.Fail(w, http.StatusNotFound, "插件未启用")
		return
	}
	if strings.HasPrefix(method, "_") || (a.Role != "service" && (method == "internal" || strings.HasPrefix(method, "internal."))) {
		forbidden(w, "内部接口不可公开访问")
		return
	}
	serverMethod := id == "nodes" && strings.HasPrefix(method, "server.")
	if a.Role == "machine" {
		if !serverMethod {
			forbidden(w, "服务器凭据仅允许访问节点同步接口")
			return
		}
	} else if serverMethod {
		plugin.Fail(w, http.StatusUnauthorized, "服务器凭据无效或服务器已停用")
		return
	}
	public := slices.Contains(p.PublicProcedures, method)
	authAction := ""
	for _, form := range p.Auth {
		proc := form.Procedure
		if proc == "" {
			proc = plugin.NormalizeProcedure(form.Path)
		}
		proc = strings.TrimPrefix(proc, id+"/")
		if proc == method {
			public = true
			authAction = "register"
			break
		}
	}
	if authAction == "" && method == "authorize" && slices.Contains(p.Permissions, "auth:login") {
		authAction = "oauth"
	}
	if !authed && !public {
		plugin.Fail(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if a.Role == "service" && !s.Plugins.Permission(a.Plugin, "call:"+id) {
		forbidden(w, "插件未获跨插件调用权限")
		return
	}
	if !authed {
		a = plugin.Actor{Role: "guest"}
	}
	if a.Scope == "read" && !plugin.IsReadProcedure(method) {
		forbidden(w, "此 API 密钥仅允许读取")
		return
	}
	if method == "ui.get" {
		var uiInput struct {
			PageID string `json:"pageId"`
			ID     string `json:"id"`
		}
		_ = json.Unmarshal(rawBody, &uiInput)
		pageID := uiInput.PageID
		if pageID == "" {
			pageID = uiInput.ID
		}
		allowed := false
		caps := s.pageCapabilities(r, p.Manifest, a.Role)
		for _, page := range p.Pages {
			if page.ID == pageID && pageAllowed(page, a.Role, caps) {
				allowed = true
				break
			}
		}
		if !allowed {
			forbidden(w, "无权访问此页面")
			return
		}
	}
	if public && a.Role != "service" && authAction != "" {
		var challenge struct {
			Purpose        string `json:"purpose"`
			ChallengeToken string `json:"challengeToken"`
		}
		if json.Unmarshal(rawBody, &challenge) != nil {
			plugin.Fail(w, http.StatusBadRequest, "请求格式无效")
			return
		}
		if authAction != "oauth" || challenge.Purpose != "bind" {
			if !s.verifyChallenge(w, r, authAction, challenge.ChallengeToken) {
				return
			}
		}
	}
	headers := r.Header.Clone()
	headers.Del("Authorization")
	headers.Del("Cookie")
	res, e := s.Plugins.Call(r.Context(), id, plugin.Request{
		Method:  http.MethodPost,
		Path:    "/_rpc/" + method,
		Body:    rawBody,
		Headers: headers,
		Actor:   a,
		Host:    r.Host,
	})
	if e != nil {
		plugin.Fail(w, http.StatusServiceUnavailable, e.Error())
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
