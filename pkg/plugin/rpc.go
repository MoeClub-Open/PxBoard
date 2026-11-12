package plugin

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"unicode"
)

// Machine returns the authenticated machine actor when present.
func Machine(r *http.Request) (Actor, bool) {
	a := Subject(r)
	return a, a.Role == "machine" && a.ID != "" && a.MachineID > 0
}

// IsReadProcedure reports whether an RPC procedure is side-effect-free for
// read-only API token checks and concurrent worker dispatch.
func IsReadProcedure(method string) bool {
	method = NormalizeProcedure(method)
	switch method {
	case "health",
		"setup.get",
		"site.get",
		"auth.challenge",
		"auth.authorizeStatus",
		"account.me",
		"overview.get",
		"settings.get",
		"mode.get",
		"plugins.list",
		"plugins.catalog",
		"ui.get",
		"summary.get",
		"client.profile",
		"wallet.get",
		"reward.history",
		"server.bootstrap",
		"server.pull",
		"status.display",
		"settings.public",
		"public.currency",
		"public.get":
		return true
	}
	for _, suffix := range []string{".get", ".list", ".options", ".periodOptions"} {
		if strings.HasSuffix(method, suffix) {
			return true
		}
	}
	return false
}

// NormalizeProcedure canonicalizes slash or dot separated procedure names.
func NormalizeProcedure(method string) string {
	method = strings.TrimSpace(strings.TrimPrefix(method, "/"))
	return strings.ReplaceAll(method, "/", ".")
}

// ServeRPC dispatches /_rpc/{method} to explicit RPC handlers first, falling
// back to translating <resource>.<verb> onto mux routes.
func ServeRPC(mux *http.ServeMux, explicit map[string]http.HandlerFunc, w http.ResponseWriter, r *http.Request) {
	method := NormalizeProcedure(strings.TrimPrefix(r.URL.Path, "/_rpc/"))
	if method == "" {
		Fail(w, http.StatusNotFound, "接口不存在")
		return
	}
	rawBody, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		Fail(w, http.StatusBadRequest, "请求格式无效")
		return
	}
	trimmed := bytes.TrimSpace(rawBody)
	if len(trimmed) == 0 {
		rawBody = []byte("{}")
	}
	if explicit != nil {
		if fn := explicit[method]; fn != nil {
			sub := r.Clone(r.Context())
			sub.Body = io.NopCloser(bytes.NewReader(rawBody))
			fn(w, sub)
			return
		}
	}
	var input map[string]any
	dec := json.NewDecoder(bytes.NewReader(rawBody))
	dec.UseNumber()
	if err := dec.Decode(&input); err != nil {
		Fail(w, http.StatusBadRequest, "请求格式无效")
		return
	}
	if input == nil {
		input = map[string]any{}
	}
	httpMethod, targetPath, usedID, ok := resolveMuxTarget(mux, method, input)
	if !ok {
		Fail(w, http.StatusNotFound, "接口不存在")
		return
	}
	query := buildQuery(input, usedID)
	fullURL := "http://plugin" + targetPath
	if encoded := query.Encode(); encoded != "" {
		fullURL += "?" + encoded
	}
	var bodyReader io.Reader
	if httpMethod != http.MethodGet && httpMethod != http.MethodHead {
		bodyReader = bytes.NewReader(rawBody)
	}
	sub := httptest.NewRequest(httpMethod, fullURL, bodyReader)
	sub.Host = r.Host
	sub.Header = r.Header.Clone()
	sub = sub.WithContext(r.Context())
	mux.ServeHTTP(w, sub)
}

func resolveMuxTarget(mux *http.ServeMux, method string, input map[string]any) (string, string, bool, bool) {
	switch method {
	case "health":
		return http.MethodGet, "/_health", false, true
	case "summary.get":
		if muxMatches(mux, http.MethodGet, "/summary") {
			return http.MethodGet, "/summary", false, true
		}
		return "", "", false, false
	case "ui.get":
		pageID := paramString(input, "pageId")
		if pageID == "" {
			pageID = paramString(input, "id")
		}
		if pageID == "" {
			return "", "", false, false
		}
		path := "/ui/" + url.PathEscape(pageID)
		if muxMatches(mux, http.MethodGet, path) {
			return http.MethodGet, path, true, true
		}
		return "", "", false, false
	}
	if !strings.Contains(method, ".") {
		for _, candidate := range uniqueCandidates("/"+toKebab(method), "/"+method) {
			if muxMatches(mux, http.MethodPost, candidate) {
				return http.MethodPost, candidate, false, true
			}
			if muxMatches(mux, http.MethodGet, candidate) {
				return http.MethodGet, candidate, false, true
			}
		}
		return "", "", false, false
	}
	idx := strings.LastIndexByte(method, '.')
	rawRes, rawVerb := method[:idx], method[idx+1:]
	bases := uniqueCandidates("/"+strings.ReplaceAll(rawRes, ".", "/"), "/"+kebabPath(rawRes))
	id := paramString(input, "id")
	escapedID := url.PathEscape(id)

	switch rawVerb {
	case "list":
		for _, base := range bases {
			if muxMatches(mux, http.MethodGet, base) {
				return http.MethodGet, base, false, true
			}
		}
	case "get":
		if id != "" {
			for _, base := range bases {
				if muxMatches(mux, http.MethodGet, base+"/"+escapedID) {
					return http.MethodGet, base + "/" + escapedID, true, true
				}
			}
		}
		for _, base := range bases {
			if muxMatches(mux, http.MethodGet, base) {
				return http.MethodGet, base, false, true
			}
		}
	case "options":
		for _, base := range bases {
			if muxMatches(mux, http.MethodGet, base+"/options") {
				return http.MethodGet, base + "/options", false, true
			}
		}
	case "create":
		for _, base := range bases {
			if muxMatches(mux, http.MethodPost, base) {
				return http.MethodPost, base, false, true
			}
		}
	case "update":
		if id != "" {
			for _, base := range bases {
				if muxMatches(mux, http.MethodPatch, base+"/"+escapedID) {
					return http.MethodPatch, base + "/" + escapedID, true, true
				}
			}
		}
		for _, base := range bases {
			if muxMatches(mux, http.MethodPatch, base) {
				return http.MethodPatch, base, false, true
			}
		}
	case "delete", "remove":
		if id != "" {
			for _, base := range bases {
				if muxMatches(mux, http.MethodDelete, base+"/"+escapedID) {
					return http.MethodDelete, base + "/" + escapedID, true, true
				}
			}
		}
		for _, base := range bases {
			if muxMatches(mux, http.MethodDelete, base) {
				return http.MethodDelete, base, false, true
			}
		}
	default:
		verbs := uniqueCandidates(toKebab(rawVerb), rawVerb)
		if id != "" {
			for _, base := range bases {
				for _, verb := range verbs {
					if muxMatches(mux, http.MethodPost, base+"/"+escapedID+"/"+verb) {
						return http.MethodPost, base + "/" + escapedID + "/" + verb, true, true
					}
				}
			}
			for _, base := range bases {
				for _, verb := range verbs {
					if muxMatches(mux, http.MethodGet, base+"/"+escapedID+"/"+verb) {
						return http.MethodGet, base + "/" + escapedID + "/" + verb, true, true
					}
				}
			}
		}
		for _, base := range bases {
			for _, verb := range verbs {
				if muxMatches(mux, http.MethodPost, base+"/"+verb) {
					return http.MethodPost, base + "/" + verb, false, true
				}
			}
		}
		for _, base := range bases {
			for _, verb := range verbs {
				if muxMatches(mux, http.MethodGet, base+"/"+verb) {
					return http.MethodGet, base + "/" + verb, false, true
				}
			}
		}
	}
	return "", "", false, false
}

func muxMatches(mux *http.ServeMux, method, path string) bool {
	_, pattern := mux.Handler(httptest.NewRequest(method, "http://plugin"+path, nil))
	return pattern != ""
}

func buildQuery(input map[string]any, usedID bool) url.Values {
	q := url.Values{}
	mine := false
	for k, v := range input {
		if v == nil || (usedID && k == "id") {
			continue
		}
		switch val := v.(type) {
		case string:
			if val != "" {
				q.Set(k, val)
			}
			if (k == "mine" && (val == "1" || val == "true")) || (k == "scope" && val == "mine") {
				mine = true
			}
		case bool:
			if k == "mine" && val {
				mine = true
			} else if val {
				q.Set(k, "1")
			} else {
				q.Set(k, "0")
			}
		case json.Number:
			q.Set(k, val.String())
			if k == "mine" && val.String() == "1" {
				mine = true
			}
		case float64:
			q.Set(k, fmt.Sprintf("%v", val))
		case int:
			q.Set(k, fmt.Sprintf("%d", val))
		case int64:
			q.Set(k, fmt.Sprintf("%d", val))
		}
	}
	if mine {
		q.Set("mine", "1")
		if q.Get("scope") == "" {
			q.Set("scope", "mine")
		}
	}
	return q
}

func paramString(input map[string]any, keys ...string) string {
	for _, key := range keys {
		switch v := input[key].(type) {
		case string:
			if s := strings.TrimSpace(v); s != "" {
				return s
			}
		case json.Number:
			if s := v.String(); s != "" {
				return s
			}
		case float64:
			return fmt.Sprintf("%.0f", v)
		case int64:
			return fmt.Sprintf("%d", v)
		case int:
			return fmt.Sprintf("%d", v)
		}
	}
	return ""
}

func toKebab(value string) string {
	var out strings.Builder
	for i, r := range value {
		if unicode.IsUpper(r) {
			if i > 0 && value[i-1] != '-' && value[i-1] != '/' && value[i-1] != '.' {
				out.WriteByte('-')
			}
			out.WriteRune(unicode.ToLower(r))
		} else {
			out.WriteRune(r)
		}
	}
	return out.String()
}

func kebabPath(dotPath string) string {
	parts := strings.Split(dotPath, ".")
	for i, p := range parts {
		parts[i] = toKebab(p)
	}
	return strings.Join(parts, "/")
}

func uniqueCandidates(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		exists := false
		for _, cur := range out {
			if cur == v {
				exists = true
				break
			}
		}
		if !exists {
			out = append(out, v)
		}
	}
	return out
}
