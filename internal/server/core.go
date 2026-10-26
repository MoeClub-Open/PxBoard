package server

import (
	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"net/http"
	"runtime"
	"slices"
	"time"
)

var started = time.Now()

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	all, e := s.Plugins.List()
	if bad(w, e) {
		return
	}
	enabled, failed := 0, 0
	for _, p := range all {
		if p.Enabled {
			enabled++
		}
		if p.Error != "" {
			failed++
		}
	}
	var users, jobs int
	_ = s.Store.DB.QueryRow("SELECT count(*) FROM users").Scan(&users)
	_ = s.Store.DB.QueryRow("SELECT count(*) FROM deliveries WHERE done=0").Scan(&jobs)
	plugin.JSON(w, plugin.Record{"plugins": len(all), "enabled": enabled, "failed": failed, "users": users, "jobs": jobs, "uptime": int(time.Since(started).Seconds()), "platform": runtime.GOOS + "/" + runtime.GOARCH, "mode": s.Store.Setting("mode", "personal"), "version": Version})
}
func (s *Server) settings(w http.ResponseWriter, r *http.Request) {
	keys := []string{"name", "publicUrl"}
	if r.Method == "PATCH" {
		var b map[string]string
		if bad(w, plugin.Decode(r, &b)) {
			return
		}
		for k, v := range b {
			if slices.Contains(keys, k) {
				if bad(w, s.Store.Set(k, v)) {
					return
				}
			}
		}
		s.Store.Log(actor(r).Email, "settings.update", "")
	}
	out := map[string]string{}
	for _, k := range keys {
		out[k] = s.Store.Setting(k, "")
	}
	out["mode"] = s.Store.Setting("mode", "personal")
	plugin.JSON(w, out)
}
func (s *Server) listPlugins(w http.ResponseWriter, r *http.Request) {
	all, e := s.Plugins.List()
	if actor(r).Role != "admin" {
		for i := range all {
			pages := []plugin.Page{}
			caps := map[string]bool{}
			if all[i].Enabled && all[i].Error == "" {
				caps = s.pageCapabilities(r, all[i].Manifest, actor(r).Role)
			}
			for _, p := range all[i].Pages {
				if pageAllowed(p, actor(r).Role, caps) {
					pages = append(pages, p)
				}
			}
			all[i].Pages = pages
			all[i].Permissions = nil
			all[i].Artifacts = nil
			all[i].Error = ""
		}
	}
	respond(w, e, all)
}
func (s *Server) catalog(w http.ResponseWriter, r *http.Request) {
	entries, sources := s.Plugins.Catalog()
	plugin.JSON(w, plugin.Record{"plugins": entries, "sources": sources, "bundles": s.Plugins.Bundles(), "platform": runtime.GOOS + "-" + runtime.GOARCH})
}
func (s *Server) install(w http.ResponseWriter, r *http.Request) {
	var b struct {
		ID       string `json:"id"`
		SourceID string `json:"sourceId"`
	}
	if bad(w, plugin.Decode(r, &b)) {
		return
	}
	e := s.Plugins.Install(b.ID, b.SourceID)
	if e == nil {
		s.Store.Log(actor(r).Email, "plugin.install", b.ID)
	}
	respond(w, e, true)
}
func (s *Server) pluginAction(w http.ResponseWriter, r *http.Request) {
	id, action := r.PathValue("id"), r.PathValue("action")
	var e error
	if r.Method == "DELETE" {
		action = "remove"
		e = s.Plugins.Remove(id)
	} else {
		switch action {
		case "enable", "restart":
			e = s.Plugins.Enable(id)
		case "disable":
			e = s.Plugins.Disable(id)
		default:
			e = problem("操作不存在")
		}
	}
	if e == nil {
		s.Store.Log(actor(r).Email, "plugin."+action, id)
	}
	respond(w, e, true)
}
func (s *Server) sources(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		out, e := s.Plugins.Sources()
		respond(w, e, out)
	case "POST":
		var b plugins.Source
		if bad(w, plugin.Decode(r, &b)) {
			return
		}
		e := s.Plugins.AddSource(b)
		if e == nil {
			s.Store.Log(actor(r).Email, "source.add", b.URL)
		}
		respond(w, e, true)
	case "PATCH":
		var b struct {
			Enabled bool `json:"enabled"`
		}
		if bad(w, plugin.Decode(r, &b)) {
			return
		}
		_, e := s.Store.DB.Exec("UPDATE sources SET enabled=? WHERE id=?", b.Enabled, r.PathValue("id"))
		respond(w, e, true)
	case "DELETE":
		_, e := s.Store.DB.Exec("DELETE FROM sources WHERE id=?", r.PathValue("id"))
		respond(w, e, true)
	}
}
func (s *Server) activity(w http.ResponseWriter, r *http.Request) {
	rows, e := s.Store.DB.Query("SELECT id,actor,action,target,created_at FROM activity ORDER BY created_at DESC LIMIT 200")
	if bad(w, e) {
		return
	}
	defer rows.Close()
	out := []plugin.Record{}
	for rows.Next() {
		var id, a, action, target, created string
		_ = rows.Scan(&id, &a, &action, &target, &created)
		out = append(out, plugin.Record{"id": id, "actor": a, "action": action, "target": target, "createdAt": created})
	}
	plugin.JSON(w, out)
}
func (s *Server) jobs(w http.ResponseWriter, r *http.Request) {
	rows, e := s.Store.DB.Query("SELECT d.event_id,d.plugin_id,e.type,d.attempts,d.error,d.next_at FROM deliveries d JOIN events e ON e.id=d.event_id WHERE d.done=0 ORDER BY e.created_at DESC LIMIT 200")
	if bad(w, e) {
		return
	}
	defer rows.Close()
	out := []plugin.Record{}
	for rows.Next() {
		var id, p, kind, err, next string
		var attempts int
		_ = rows.Scan(&id, &p, &kind, &attempts, &err, &next)
		out = append(out, plugin.Record{"id": id, "plugin": p, "type": kind, "attempts": attempts, "error": err, "nextAt": next})
	}
	plugin.JSON(w, out)
}
func (s *Server) retryJob(w http.ResponseWriter, r *http.Request) {
	_, e := s.Store.DB.Exec("UPDATE deliveries SET attempts=0,next_at=? WHERE event_id=? AND done=0", store.Now(), r.PathValue("id"))
	respond(w, e, true)
}
