package server

import (
	"encoding/json"
	"net/http"
	"slices"

	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (s *Server) pageCapabilities(r *http.Request, manifest plugin.Manifest, role string) map[string]bool {
	caps := map[string]bool{}
	if role == "admin" {
		return caps
	}
	for _, page := range manifest.Pages {
		if page.Capability == "" || !slices.Contains(page.Roles, role) {
			continue
		}
		res, e := s.Plugins.Call(r.Context(), manifest.ID, plugin.Request{Method: "GET", Path: "/_capabilities", Actor: plugin.Actor{Role: "service", Plugin: "core"}})
		if e == nil && res.Status == http.StatusOK {
			var result struct {
				Data map[string]bool `json:"data"`
			}
			if json.Unmarshal(res.Body, &result) == nil {
				return result.Data
			}
		}
		break
	}
	return caps
}

func pageAllowed(page plugin.Page, role string, caps map[string]bool) bool {
	return slices.Contains(page.Roles, role) && (role == "admin" || page.Capability == "" || caps[page.Capability])
}
