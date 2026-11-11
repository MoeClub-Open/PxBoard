package server

import (
	"encoding/json"
	"net/http"
)

func (s *Server) rpcSchema(w http.ResponseWriter, r *http.Request) {
	pluginsList, _ := s.Plugins.List()
	services := map[string]any{
		"core": map[string]any{
			"publicProcedures": []string{
				"health",
				"setup.get",
				"setup.init",
				"site.get",
				"auth.challenge",
				"auth.login",
				"auth.logout",
				"auth.resetRequest",
				"auth.resetPassword",
				"auth.authorizeCreate",
				"auth.authorizeStatus",
				"auth.authorizeExchange",
				"auth.browserExchange",
				"auth.externalComplete",
			},
			"memberProcedures": []string{
				"auth.authorizeApprove",
				"auth.browserLink",
				"account.me",
				"account.changePassword",
				"tokens.list",
				"tokens.create",
				"tokens.revoke",
				"overview.get",
				"plugins.list",
			},
			"adminProcedures": []string{
				"onboarding.complete",
				"settings.get",
				"settings.update",
				"mode.get",
				"mode.apply",
				"users.list",
				"users.options",
				"users.create",
				"users.update",
				"plugins.catalog",
				"plugins.install",
				"plugins.action",
				"plugins.remove",
				"sources.list",
				"sources.create",
				"sources.update",
				"sources.remove",
				"activity.list",
				"jobs.list",
				"jobs.retry",
			},
		},
	}
	for _, p := range pluginsList {
		if !p.Enabled {
			continue
		}
		services[p.ID] = map[string]any{
			"version":          p.Version,
			"publicProcedures": p.PublicProcedures,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"rpcVersion": "1.0",
		"version":    Version,
		"transport": map[string]any{
			"unary": "POST /rpc/v1/{service}/{method}",
			"batch": "POST /rpc/v1/$batch",
			"files": "GET /files/{plugin}/{path...}",
		},
		"auth": map[string]any{
			"bearer": "Authorization: Bearer <session | px_api_token | machine_key>",
			"cookie": "px_session",
		},
		"envelope": map[string]any{
			"success": map[string]string{"data": "procedure result"},
			"error":   map[string]any{"error": map[string]string{"code": "string", "message": "string"}},
		},
		"services": services,
	})
}
