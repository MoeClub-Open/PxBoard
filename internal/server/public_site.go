package server

import (
	"bytes"
	"encoding/json"
	"html/template"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"

	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

type publicDocument struct {
	Site             p.PublicSite `json:"site"`
	Mode             string       `json:"mode"`
	Initialized      bool         `json:"initialized"`
	Available        bool         `json:"available"`
	RegistrationOpen bool         `json:"registrationOpen"`
	BaseURL          string       `json:"baseUrl"`
}

func publicOrigin(value string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return "", false
	}
	return u.Scheme + "://" + u.Host, true
}

func (s *Server) siteDocument(r *http.Request, content bool) publicDocument {
	base := s.PublicURL
	if base == "" {
		base = s.Store.Setting("publicUrl", "")
	}
	base, _ = publicOrigin(base) // Never build canonical URLs from an untrusted Host header.
	doc := publicDocument{Mode: s.Store.Setting("mode", "personal"), Initialized: s.initialized(), BaseURL: base}
	doc.Site = p.PublicSite{Name: s.Store.Setting("name", "PxBoard"), Title: s.Store.Setting("name", "PxBoard")}
	if !doc.Initialized {
		return doc
	}
	forms, _, _ := s.publicAuth(r)
	doc.RegistrationOpen = len(forms) > 0
	all, err := s.Plugins.List()
	if err != nil {
		return doc
	}
	for _, entry := range all {
		provider := entry.Site
		if !entry.Enabled || entry.Error != "" || provider == nil || len(provider.Modes) > 0 && !slices.Contains(provider.Modes, doc.Mode) {
			continue
		}
		body, _ := json.Marshal(p.SiteContext{Content: content, Name: doc.Site.Name, Mode: doc.Mode, BaseURL: base, RegistrationOpen: doc.RegistrationOpen})
		res, err := s.Plugins.Call(r.Context(), entry.ID, p.Request{Method: "GET", Path: provider.Path, Body: body, Actor: p.Actor{Role: "service", Plugin: "core"}})
		if err != nil || res.Status != 200 {
			continue
		}
		var envelope struct{ Data p.PublicSite }
		if json.Unmarshal(res.Body, &envelope) != nil {
			continue
		}
		doc.Site = envelope.Data
		if doc.Site.Name == "" {
			doc.Site.Name = s.Store.Setting("name", "PxBoard")
		}
		if doc.Site.Title == "" {
			doc.Site.Title = doc.Site.Name
		}
		doc.Available = true
		doc.Site.Indexable = doc.Site.Indexable && base != "" && s.onboardingComplete() && s.modeState().Phase == "ready"
		break
	}
	return doc
}

func (s *Server) publicSite(w http.ResponseWriter, r *http.Request) {
	doc := s.siteDocument(r, true)
	if doc.Site.Renderer == "storefront" {
		doc.Site.HTML = ""
	}
	w.Header().Set("Cache-Control", "no-store")
	p.JSON(w, doc)
}

var documentHead = template.Must(template.New("head").Parse(`<title>{{.Site.Title}}</title>
<meta name="description" content="{{.Site.Description}}">
<meta name="robots" content="{{if .Site.Indexable}}index, follow{{else}}noindex, nofollow{{end}}">
{{if .BaseURL}}<link rel="canonical" href="{{.BaseURL}}/">{{end}}
<meta property="og:type" content="website"><meta property="og:locale" content="zh_CN">
<meta property="og:site_name" content="{{.Site.Name}}"><meta property="og:title" content="{{.Site.Title}}">
<meta property="og:description" content="{{.Site.Description}}">
{{if .BaseURL}}<meta property="og:url" content="{{.BaseURL}}/">{{end}}
{{if .Site.ImageURL}}<meta property="og:image" content="{{.Site.ImageURL}}">{{end}}
<meta name="twitter:card" content="{{if .Site.ImageURL}}summary_large_image{{else}}summary{{end}}">
<meta name="twitter:title" content="{{.Site.Title}}"><meta name="twitter:description" content="{{.Site.Description}}">
{{if .Site.ImageURL}}<meta name="twitter:image" content="{{.Site.ImageURL}}">{{end}}
{{if .Site.FaviconURL}}<link rel="icon" href="{{.Site.FaviconURL}}">{{end}}`))

func (s *Server) serveDocument(w http.ResponseWriter, r *http.Request) {
	index, err := os.ReadFile(filepath.Join(s.Web, "index.html"))
	if err != nil {
		http.Error(w, "页面暂不可用", http.StatusServiceUnavailable)
		return
	}
	doc := s.siteDocument(r, r.URL.Path == "/")
	public := r.URL.Path == "/" && doc.Available
	if !public {
		doc.Site.Indexable = false
		doc.Site.Description = ""
		doc.BaseURL = ""
		doc.Site.Title = doc.Site.Name
	}
	var head bytes.Buffer
	if documentHead.Execute(&head, doc) != nil {
		http.Error(w, "页面暂不可用", 503)
		return
	}
	html := strings.Replace(string(index), "<title>PxBoard</title>", head.String(), 1)
	if public {
		content := doc.Site.HTML
		if doc.Site.Renderer == "storefront" {
			doc.Site.HTML = ""
		}
		boot, _ := json.Marshal(doc)
		schema, _ := json.Marshal(p.Record{"@context": "https://schema.org", "@type": "WebSite", "name": doc.Site.Name, "url": doc.BaseURL + "/", "description": doc.Site.Description})
		body := "<div id=\"root\">" + content + "</div><script id=\"px-public-site\" type=\"application/json\">" + string(boot) + "</script>"
		if doc.BaseURL != "" {
			body += "<script type=\"application/ld+json\">" + string(schema) + "</script>"
		}
		html = strings.Replace(html, "<div id=\"root\"></div>", body, 1)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if doc.Site.Indexable {
		w.Header().Del("X-Robots-Tag")
	}
	if r.Method != "HEAD" {
		_, _ = w.Write([]byte(html))
	}
}

func (s *Server) robots(w http.ResponseWriter, r *http.Request) {
	doc := s.siteDocument(r, false)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	text := "User-agent: *\nDisallow: /\n"
	if doc.Available && doc.Site.Indexable {
		text += "Allow: /$\nAllow: /assets/\nAllow: /favicon.svg\nSitemap: " + doc.BaseURL + "/sitemap.xml\n"
	}
	_, _ = w.Write([]byte(text))
}

func (s *Server) sitemap(w http.ResponseWriter, r *http.Request) {
	doc := s.siteDocument(r, false)
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	text := `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
	if doc.Available && doc.Site.Indexable {
		text += "<url><loc>" + template.HTMLEscapeString(doc.BaseURL+"/") + "</loc></url>"
	}
	_, _ = w.Write([]byte(text + "</urlset>"))
}
