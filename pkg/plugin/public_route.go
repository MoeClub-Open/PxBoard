package plugin

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var routePart = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

// PublicRoutePaths returns the public paths for a subscription route. Base URLs
// may contain a path prefix, as they do in some Xboard installations.
func PublicRoutePaths(route Record) ([]string, error) {
	path := strings.TrimPrefix(Text(route, "path"), "/")
	if !routePart.MatchString(path) {
		return nil, fmt.Errorf("订阅路径必须为单级字母、数字、下划线或连字符")
	}
	values := strings.FieldsFunc(Text(route, "baseUrls"), func(r rune) bool { return r == ',' || r == '\n' || r == '\r' })
	if len(values) == 0 {
		values = []string{""}
	}
	paths := []string{}
	for _, value := range values {
		prefix := ""
		if value = strings.TrimSpace(value); value != "" {
			u, err := url.Parse(value)
			if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.RawPath != "" {
				return nil, fmt.Errorf("订阅地址无效或包含不支持的动态格式")
			}
			prefix = strings.TrimSuffix(u.Path, "/")
			for _, part := range strings.Split(strings.TrimPrefix(prefix, "/"), "/") {
				if part != "" && !routePart.MatchString(part) {
					return nil, fmt.Errorf("订阅地址路径无效")
				}
			}
			if strings.Contains(prefix, "//") {
				return nil, fmt.Errorf("订阅地址路径无效")
			}
		}
		full := prefix + "/" + path
		first := strings.ToLower(strings.Split(strings.TrimPrefix(full, "/"), "/")[0])
		switch first {
		case "api", "user", "auth", "login", "register", "forgot", "reset", "account", "assets", "health", "setup", "admin":
			return nil, fmt.Errorf("订阅路径与已有页面冲突")
		}
		paths = append(paths, full)
	}
	return paths, nil
}
