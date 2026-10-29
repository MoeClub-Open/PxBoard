package server

import (
	"net/http"
	"strings"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (s *Server) onboardingComplete() bool {
	// Existing deployments remain ready; only newly created workspaces opt in.
	return s.Store.Setting("onboarding_complete", "true") != "false"
}

func (s *Server) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	var b struct{ Name, PublicURL, AdminPath string }
	if bad(w, p.Decode(r, &b)) {
		return
	}
	if s.modeState().Phase != "ready" {
		p.Fail(w, 400, "请先完成所选功能安装")
		return
	}
	origin, valid := publicOrigin(b.PublicURL)
	if !valid {
		p.Fail(w, 400, "请填写完整的站点公开地址")
		return
	}
	if s.Store.Setting("mode", "personal") == "business" && !validAdminPath(b.AdminPath) {
		p.Fail(w, 400, "请填写有效的独立后台入口路径")
		return
	}
	tx, err := s.Store.DB.Begin()
	if bad(w, err) {
		return
	}
	defer tx.Rollback()
	if s.Store.Setting("mode", "personal") == "business" {
		routes, err := registeredRoutes(tx)
		if bad(w, err) {
			return
		}
		for _, route := range routes {
			if routeConflictsAdmin([]string{route.path}, b.AdminPath) {
				p.Fail(w, 400, "后台入口与现有公开路由冲突")
				return
			}
		}
	}
	values := map[string]string{"publicUrl": origin, "onboarding_complete": "true"}
	if strings.TrimSpace(b.Name) != "" {
		values["name"] = strings.TrimSpace(b.Name)
	}
	if s.Store.Setting("mode", "personal") == "business" {
		values["adminPath"] = strings.TrimSpace(b.AdminPath)
	}
	for key, value := range values {
		if _, err = tx.Exec("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value); bad(w, err) {
			return
		}
	}
	if !bad(w, tx.Commit()) {
		p.JSON(w, p.Record{"complete": true, "adminPath": s.adminPath()})
	}
}
