package server

import (
	"net/http"
	"strings"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func routeConflictsAdmin(paths []string, admin string) bool {
	for _, path := range paths {
		if path == admin || strings.HasPrefix(path, admin+"/") || strings.HasPrefix(admin, path+"/") {
			return true
		}
	}
	return false
}

func (s *Server) publicRoute(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	installed, err := s.Plugins.Get("subscriptions")
	if err != nil || !installed.Enabled {
		return false
	}
	rows, err := s.Store.List("subscriptions", "public_routes")
	if err != nil {
		return false
	}
	for _, row := range rows {
		if !p.Bool(row, "enabled") {
			continue
		}
		paths, err := p.PublicRoutePaths(row)
		if err != nil || routeConflictsAdmin(paths, s.adminPath()) {
			continue
		}
		for _, path := range paths {
			prefix := path + "/"
			if !strings.HasPrefix(r.URL.Path, prefix) {
				continue
			}
			token := strings.TrimPrefix(r.URL.Path, prefix)
			if token == "" || strings.Contains(token, "/") {
				continue
			}
			r.SetPathValue("plugin", "subscriptions")
			r.SetPathValue("path", "s/"+token)
			s.extension(w, r)
			return true
		}
	}
	return false
}
