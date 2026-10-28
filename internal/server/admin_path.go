package server

import (
	"net/url"
	"regexp"
	"strings"
)

var adminPathPattern = regexp.MustCompile(`^/[a-zA-Z0-9_-]{3,64}$`)

func validAdminPath(value string) bool {
	if !adminPathPattern.MatchString(value) {
		return false
	}
	switch strings.ToLower(value) {
	case "/api", "/user", "/auth", "/login", "/register", "/forgot", "/reset", "/account", "/assets", "/health", "/setup":
		return false
	}
	return true
}

func (s *Server) adminPath() string {
	if s.Store.Setting("mode", "personal") != "business" {
		return "/admin"
	}
	value := s.Store.Setting("adminPath", "/admin")
	if !validAdminPath(value) {
		return "/admin"
	}
	return value
}

func (s *Server) isAdminEntry(value string) bool {
	u, err := url.ParseRequestURI(value)
	if err != nil || u.IsAbs() || u.Host != "" || strings.Contains(value, "\\") {
		return false
	}
	root := s.adminPath()
	return u.Path == root || strings.HasPrefix(u.Path, root+"/")
}
