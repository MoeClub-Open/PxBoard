package server

import (
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	p "github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"net/http"
)

type modePlugin struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}
type modeState struct {
	Mode          string       `json:"mode"`
	RequestedMode string       `json:"requestedMode"`
	Phase         string       `json:"phase"`
	SourceID      string       `json:"sourceId,omitempty"`
	SourceURL     string       `json:"sourceUrl"`
	Plugins       []modePlugin `json:"plugins"`
	Error         string       `json:"error,omitempty"`
	Message       string       `json:"message,omitempty"`
	UpdatedAt     string       `json:"updatedAt"`
}

func validMode(mode string) bool {
	return mode == "personal" || mode == "sharing" || mode == "business"
}
func (s *Server) modeState() modeState {
	mode := s.Store.Setting("mode", "personal")
	state := modeState{Mode: mode, RequestedMode: s.Store.Setting("requested_mode", mode), Phase: "needs_install", SourceURL: s.DefaultPluginSource, Plugins: []modePlugin{}}
	_ = json.Unmarshal([]byte(s.Store.Setting("mode_state", "")), &state)
	state.Mode = mode
	if state.SourceURL == "" {
		state.SourceURL = "https://raw.githubusercontent.com/MoeClub-Open/PxBoard-Registry/main/index.json"
	}
	s.modeMu.Lock()
	working := s.modeWorking
	s.modeMu.Unlock()
	if state.Phase == "installing" && !working {
		state.Phase = "failed"
		state.Error = "上次安装已中断，可以重试"
	}
	return state
}
func (s *Server) saveMode(state modeState) error {
	state.UpdatedAt = store.Now()
	raw, e := json.Marshal(state)
	if e != nil {
		return e
	}
	return s.Store.Set("mode_state", string(raw))
}
func (s *Server) workspaceMode(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		p.JSON(w, s.modeState())
		return
	}
	var request struct {
		Mode      string `json:"mode"`
		SourceID  string `json:"sourceId"`
		SourceURL string `json:"sourceUrl"`
	}
	if bad(w, p.Decode(r, &request)) {
		return
	}
	if !validMode(request.Mode) {
		p.Fail(w, 400, "请选择自用、分享或商业运营")
		return
	}
	s.modeMu.Lock()
	if s.modeWorking {
		s.modeMu.Unlock()
		p.Fail(w, 409, "正在安装，请等待当前任务结束")
		return
	}
	s.modeWorking = true
	s.modeMu.Unlock()
	state := s.modeState()
	state.RequestedMode = request.Mode
	state.Phase = "installing"
	state.Error = ""
	state.Message = "正在读取插件源"
	state.Plugins = []modePlugin{}
	if request.SourceID != "" {
		state.SourceID = request.SourceID
	}
	if request.SourceURL != "" {
		state.SourceURL = request.SourceURL
		state.SourceID = ""
	}
	if e := s.saveMode(state); e != nil {
		s.modeMu.Lock()
		s.modeWorking = false
		s.modeMu.Unlock()
		bad(w, e)
		return
	}
	user := actor(r).ID
	go s.installMode(state, user)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	p.JSON(w, state)
}
func (s *Server) installMode(state modeState, user string) {
	defer func() { s.modeMu.Lock(); s.modeWorking = false; s.modeMu.Unlock() }()
	fail := func(e error) {
		state.Phase = "failed"
		state.Error = e.Error()
		state.Message = "功能安装未完成"
		_ = s.saveMode(state)
	}
	sources, e := s.Plugins.Sources()
	if e != nil {
		fail(e)
		return
	}
	if state.SourceID == "" {
		for _, source := range sources {
			if source.URL == state.SourceURL {
				state.SourceID = source.ID
				if !source.Enabled {
					if _, e = s.Store.DB.Exec("UPDATE sources SET enabled=1 WHERE id=?", source.ID); e != nil {
						fail(e)
						return
					}
				}
			}
		}
		if state.SourceID == "" {
			key := ""
			if state.SourceURL == s.DefaultPluginSource {
				key = s.DefaultPluginPublicKey
			}
			if e = s.Plugins.AddSource(plugins.Source{URL: state.SourceURL, PublicKey: key}); e != nil {
				fail(fmt.Errorf("无法连接插件源：%w", e))
				return
			}
			sources, e = s.Plugins.Sources()
			if e != nil {
				fail(e)
				return
			}
			for _, source := range sources {
				if source.URL == state.SourceURL {
					state.SourceID = source.ID
				}
			}
		}
	} else {
		for _, source := range sources {
			if source.ID == state.SourceID {
				state.SourceURL = source.URL
			}
		}
	}
	plan, e := s.Plugins.BundlePlan(state.RequestedMode, state.SourceID)
	if e != nil {
		fail(e)
		return
	}
	for _, entry := range plan {
		state.Plugins = append(state.Plugins, modePlugin{ID: entry.ID, Name: entry.Name, Status: "pending"})
	}
	state.Message = "正在安装并启用功能"
	if e = s.saveMode(state); e != nil {
		fail(e)
		return
	}
	e = s.Plugins.InstallPlan(plan, state.SourceID, func(id, status string, err error) {
		for index, item := range state.Plugins {
			if item.ID == id {
				state.Plugins[index].Status = status
				if err != nil {
					state.Plugins[index].Error = err.Error()
				}
			}
		}
		_ = s.saveMode(state)
	})
	if e != nil {
		fail(e)
		return
	}
	ids := []string{}
	for _, entry := range plan {
		ids = append(ids, entry.ID)
	}
	if e = s.Plugins.Emit("core", "workspace.configured", p.Record{"mode": state.RequestedMode, "userId": user, "plugins": ids}); e != nil {
		fail(e)
		return
	}
	if e = s.Store.Set("mode", state.RequestedMode); e != nil {
		fail(e)
		return
	}
	state.Mode = state.RequestedMode
	state.Phase = "ready"
	state.Message = "所选功能已安装并启用"
	state.Error = ""
	if e = s.saveMode(state); e != nil {
		fail(e)
		return
	}
	s.Store.Log(user, "workspace.mode", state.Mode)
}
