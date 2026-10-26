package server

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
)

func (s *Server) openapi(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"openapi": "3.1.0", "info": map[string]any{"title": "PxBoard API", "version": Version}, "servers": []any{map[string]string{"url": "/api/v1"}}, "paths": apiPaths(), "components": map[string]any{"securitySchemes": map[string]any{"session": map[string]any{"type": "apiKey", "in": "cookie", "name": "px_session"}, "bearer": map[string]any{"type": "http", "scheme": "bearer"}}, "schemas": map[string]any{"Error": map[string]any{"type": "object", "required": []string{"error"}, "properties": map[string]any{"error": map[string]any{"type": "object", "required": []string{"code", "message"}, "properties": map[string]any{"code": map[string]string{"type": "string"}, "message": map[string]string{"type": "string"}}}}}, "Result": map[string]any{"type": "object", "required": []string{"data"}, "properties": map[string]any{"data": map[string]any{}}}}}, "security": []any{map[string]any{"session": []string{}}, map[string]any{"bearer": []string{}}}})
}
func apiPaths() map[string]any {
	out := map[string]any{}
	params := regexp.MustCompile(`\{([^}]+)\}`)
	for path, methods := range map[string][]string{"/health": {"get"}, "/setup": {"get", "post"}, "/auth/login": {"post"}, "/auth/logout": {"post"}, "/auth/reset-request": {"post"}, "/auth/reset": {"post"}, "/me": {"get"}, "/me/password": {"post"}, "/tokens": {"get", "post"}, "/tokens/{id}": {"delete"}, "/overview": {"get"}, "/settings": {"get", "patch"}, "/users": {"get", "post"}, "/users/{id}": {"patch"}, "/plugins": {"get"}, "/plugins/catalog": {"get"}, "/plugins/install": {"post"}, "/plugins/{id}/{action}": {"post"}, "/plugins/{id}": {"delete"}, "/sources": {"get", "post"}, "/sources/{id}": {"patch", "delete"}, "/activity": {"get"}, "/jobs": {"get"}, "/jobs/{id}/retry": {"post"}} {
		item := map[string]any{}
		for _, method := range methods {
			responses := map[string]any{}
			for code, label := range map[string]string{"200": "成功", "400": "请求无效", "401": "需要登录", "403": "权限不足", "404": "资源不存在", "409": "资源冲突", "503": "插件不可用"} {
				schema := "Error"
				if code == "200" {
					schema = "Result"
				}
				responses[code] = map[string]any{"description": label, "content": map[string]any{"application/json": map[string]any{"schema": map[string]string{"$ref": "#/components/schemas/" + schema}}}}
			}
			op := map[string]any{"operationId": method + strings.NewReplacer("/", "_", "{", "", "}", "").Replace(path), "responses": responses}
			ps := []any{}
			for _, match := range params.FindAllStringSubmatch(path, -1) {
				ps = append(ps, map[string]any{"name": match[1], "in": "path", "required": true, "schema": map[string]string{"type": "string"}})
			}
			if len(ps) > 0 {
				op["parameters"] = ps
			}
			if method == "post" || method == "patch" {
				schema := map[string]any{"type": "object", "additionalProperties": true}
				properties := map[string]any{}
				required := []string{}
				fields := map[string][]string{"/auth/login": {"email", "password", "code"}, "/auth/reset-request": {"email"}, "/auth/reset": {"token", "password"}, "/me/password": {"currentPassword", "password"}, "/setup": {"email", "password", "name", "mode"}, "/plugins/install": {"id", "sourceId"}, "/sources": {"url", "name", "publicKey"}, "/tokens": {"name", "scope", "expiresAt"}, "/users": {"email", "password", "name", "role"}}[path]
				for _, name := range fields {
					properties[name] = map[string]string{"type": "string"}
				}
				if len(properties) > 0 {
					schema["properties"] = properties
				}
				switch path {
				case "/auth/login", "/setup", "/users":
					required = []string{"email", "password"}
				case "/plugins/install":
					required = []string{"id", "sourceId"}
				case "/sources":
					required = []string{"url"}
				case "/tokens":
					required = []string{"name"}
				}
				if len(required) > 0 {
					schema["required"] = required
				}
				op["requestBody"] = map[string]any{"content": map[string]any{"application/json": map[string]any{"schema": schema}}}
			}
			if path == "/health" || path == "/setup" || strings.HasPrefix(path, "/auth/") {
				op["security"] = []any{}
			}
			item[method] = op
		}
		out[path] = item
	}
	out["/mode"] = map[string]any{
		"get":  map[string]any{"operationId": "getWorkspaceMode", "responses": map[string]any{"200": map[string]any{"description": "当前模式与安装进度"}}},
		"post": map[string]any{"operationId": "applyWorkspaceMode", "requestBody": map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object", "required": []string{"mode"}, "properties": map[string]any{"mode": map[string]any{"type": "string", "enum": []string{"personal", "sharing", "business"}}, "sourceId": map[string]string{"type": "string"}, "sourceUrl": map[string]string{"type": "string", "format": "uri"}}}}}}, "responses": map[string]any{"202": map[string]any{"description": "后台安装已开始，通过 GET /mode 查询进度"}, "409": map[string]any{"description": "已有安装任务在运行"}}},
	}
	out["/auth/external/complete"] = map[string]any{
		"post": map[string]any{
			"operationId": "completeExternalLogin",
			"summary":     "使用外部认证的一次性凭证登录",
			"description": "核对浏览器证明、插件授权及账户状态；启用动态验证码的账户还需提交 code。只有成功登录才会消费凭证并设置会话 Cookie。",
			"security":    []any{},
			"requestBody": map[string]any{
				"required": true,
				"content": map[string]any{"application/json": map[string]any{"schema": map[string]any{
					"type": "object", "required": []string{"ticket", "proof"},
					"properties": map[string]any{
						"ticket": map[string]string{"type": "string", "description": "认证插件通过核心签发的登录凭证，三分钟内有效且只能成功使用一次"},
						"proof":  map[string]string{"type": "string", "description": "发起认证时保存在当前浏览器中的随机证明原文"},
						"code":   map[string]string{"type": "string", "description": "已启用动态验证时所需的六位验证码"},
					},
				}}},
			},
			"responses": map[string]any{
				"200": map[string]any{"description": "登录成功，data 包含 user 身份与 redirectPath，并设置 HttpOnly 会话 Cookie"},
				"400": map[string]any{"description": "请求格式或跳转地址无效"},
				"401": map[string]any{"description": "凭证或浏览器证明无效、凭证已使用或到期；error.code=mfa_required 时可用同一凭证补交验证码"},
				"403": map[string]any{"description": "账户已停用，或认证插件已停用、登录授权已撤回"},
			},
		},
	}
	return out
}
