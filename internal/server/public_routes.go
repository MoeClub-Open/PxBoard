package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

type routeQuery interface {
	Query(string, ...any) (*sql.Rows, error)
	QueryRow(string, ...any) *sql.Row
}
type registeredRoute struct {
	owner, id, target, path string
	enabled                 bool
}

func routeConflictsAdmin(paths []string, admin string) bool {
	for _, path := range paths {
		if path == admin || strings.HasPrefix(path, admin+"/") || strings.HasPrefix(admin, path+"/") {
			return true
		}
	}
	return false
}

func publicTarget(manifest p.Manifest) bool {
	target := manifest.PublicRouteTarget
	if target == "" || !strings.HasPrefix(target, "/") || strings.HasPrefix(target, "/_") || strings.ContainsAny(target, "?{}\\") {
		return false
	}
	for _, path := range manifest.PublicPaths {
		if target == path || strings.HasPrefix(target, path+"/") {
			return true
		}
	}
	return false
}

func registeredRoutes(q routeQuery) ([]registeredRoute, error) {
	rows, err := q.Query("SELECT d.namespace,d.id,d.data,p.manifest,p.enabled FROM documents d JOIN plugins p ON p.id=d.namespace WHERE d.collection='public_routes'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	routes := []registeredRoute{}
	for rows.Next() {
		var owner, id, raw, manifestRaw string
		var enabled bool
		if err := rows.Scan(&owner, &id, &raw, &manifestRaw, &enabled); err != nil {
			return nil, err
		}
		var route p.Record
		var manifest p.Manifest
		if json.Unmarshal([]byte(raw), &route) != nil || !p.Bool(route, "enabled") || json.Unmarshal([]byte(manifestRaw), &manifest) != nil || !publicTarget(manifest) {
			continue
		}
		paths, err := p.PublicRoutePaths(route)
		if err != nil {
			return nil, err
		}
		for _, path := range paths {
			routes = append(routes, registeredRoute{owner: owner, id: id, target: manifest.PublicRouteTarget, path: path, enabled: enabled})
		}
	}
	return routes, rows.Err()
}

func (s *Server) validatePublicRoute(q routeQuery, owner, collection string, route p.Record) error {
	if collection != "public_routes" || !p.Bool(route, "enabled") {
		return nil
	}
	var raw string
	if err := q.QueryRow("SELECT manifest FROM plugins WHERE id=?", owner).Scan(&raw); err != nil {
		return err
	}
	var manifest p.Manifest
	if json.Unmarshal([]byte(raw), &manifest) != nil || !publicTarget(manifest) {
		return fmt.Errorf("插件未声明可用的公开路由目标")
	}
	paths, err := p.PublicRoutePaths(route)
	if err != nil {
		return err
	}
	admin := "/admin"
	_ = q.QueryRow("SELECT value FROM settings WHERE key='adminPath'").Scan(&admin)
	if routeConflictsAdmin(paths, admin) {
		return fmt.Errorf("公开路由与后台入口冲突")
	}
	existing, err := registeredRoutes(q)
	if err != nil {
		return err
	}
	for _, old := range existing {
		if old.owner == owner && old.id == p.Text(route, "id") {
			continue
		}
		if routeConflictsAdmin(paths, old.path) {
			return fmt.Errorf("公开路由已被其他配置占用")
		}
	}
	return nil
}

func (s *Server) publicRoute(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	routes, err := registeredRoutes(s.Store.DB)
	if err != nil {
		p.Fail(w, 503, "公开路由暂时不可用")
		return true
	}
	for _, route := range routes {
		if !route.enabled {
			continue
		}
		if routeConflictsAdmin([]string{route.path}, s.adminPath()) {
			continue
		}
		prefix := route.path + "/"
		if !strings.HasPrefix(r.URL.Path, prefix) {
			continue
		}
		value := strings.TrimPrefix(r.URL.Path, prefix)
		if value == "" || strings.Contains(value, "/") {
			continue
		}
		r.SetPathValue("plugin", route.owner)
		r.SetPathValue("path", strings.TrimPrefix(route.target, "/")+"/"+value)
		s.extension(w, r)
		return true
	}
	return false
}
