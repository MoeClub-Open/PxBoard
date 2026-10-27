package server

import (
	"encoding/json"
	"net/http"
	"slices"

	"github.com/MoeClub-Open/PxBoard/internal/plugins"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

// A challenge provider is optional; if enabled but unavailable, protected actions fail closed.
func (s *Server) challengeProvider() (*plugins.Installed, error) {
	all, err := s.Plugins.List()
	if err != nil {
		return nil, err
	}
	var provider *plugins.Installed
	for i := range all {
		p := &all[i]
		if !p.Enabled || !slices.Contains(p.Capabilities, "security.challenge") {
			continue
		}
		if provider != nil {
			return nil, problem("只能启用一个人机验证插件")
		}
		provider = p
	}
	return provider, nil
}

func (s *Server) challengeCall(r *http.Request, method, path string, body any) (plugin.Response, error) {
	provider, err := s.challengeProvider()
	if err != nil {
		return plugin.Response{}, err
	}
	if provider == nil {
		return plugin.Response{Status: 204}, nil
	}
	if provider.Error != "" {
		return plugin.Response{}, problem("人机验证暂不可用，请联系管理员")
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return plugin.Response{}, err
	}
	return s.Plugins.Call(r.Context(), provider.ID, plugin.Request{Method: method, Path: path, Body: raw, Actor: plugin.Actor{Role: "service", Plugin: "core"}})
}

func (s *Server) challengeConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	res, err := s.challengeCall(r, "GET", "/_challenge", nil)
	if err != nil || (res.Status != 200 && res.Status != 204) {
		plugin.Fail(w, 503, "人机验证暂不可用，请联系管理员")
		return
	}
	if res.Status == 204 {
		plugin.JSON(w, plugin.Record{"enabled": false})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(res.Body)
}

func (s *Server) verifyChallenge(w http.ResponseWriter, r *http.Request, action, token string) bool {
	res, err := s.challengeCall(r, "POST", "/_challenge/verify", plugin.Record{"action": action, "token": token})
	if err != nil || (res.Status != 200 && res.Status != 204 && res.Status != 400) {
		plugin.FailCode(w, 503, "challenge_unavailable", "人机验证暂不可用，请稍后重试")
		return false
	}
	if res.Status == 400 {
		plugin.FailCode(w, 400, "challenge_required", "请完成人机验证后重试")
		return false
	}
	return true
}

// runtimeChallenge lets authorized plugins reuse a configured challenge provider.
// A missing or disabled provider must not turn a protected plugin action into a success.
func (s *Server) runtimeChallenge(w http.ResponseWriter, r *http.Request, actor plugin.Actor) {
	if !s.Plugins.Permission(actor.Plugin, "challenge:verify") {
		forbidden(w, "插件未获人机验证权限")
		return
	}
	provider, err := s.challengeProvider()
	if err != nil || provider == nil || provider.ID == actor.Plugin || provider.Error != "" || !slices.Contains(provider.Capabilities, "security.challenge.subscription") {
		plugin.Fail(w, 503, "订阅人机验证服务不可用")
		return
	}
	config, err := s.Plugins.Call(r.Context(), provider.ID, plugin.Request{Method: "GET", Path: "/_challenge", Actor: plugin.Actor{Role: "service", Plugin: "core"}})
	var envelope struct {
		Data struct {
			Enabled  bool   `json:"enabled"`
			SiteKey  string `json:"siteKey"`
			Provider string `json:"provider"`
		} `json:"data"`
	}
	if err != nil || config.Status != 200 || json.Unmarshal(config.Body, &envelope) != nil || !envelope.Data.Enabled || envelope.Data.SiteKey == "" || envelope.Data.Provider == "" {
		plugin.Fail(w, 503, "订阅人机验证服务不可用")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == "GET" {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(config.Body)
		return
	}
	var request struct{ Action, Token string }
	if plugin.Decode(r, &request) != nil || request.Action != "subscription" || request.Token == "" {
		plugin.Fail(w, 400, "请完成人机验证")
		return
	}
	body, _ := json.Marshal(request)
	result, err := s.Plugins.Call(r.Context(), provider.ID, plugin.Request{Method: "POST", Path: "/_challenge/verify", Body: body, Actor: plugin.Actor{Role: "service", Plugin: "core"}})
	if err != nil || (result.Status != 200 && result.Status != 400) {
		plugin.Fail(w, 503, "订阅人机验证服务不可用")
		return
	}
	var verified struct {
		Data bool `json:"data"`
	}
	if result.Status == 400 || json.Unmarshal(result.Body, &verified) != nil || !verified.Data {
		plugin.Fail(w, 400, "人机验证未通过")
		return
	}
	plugin.JSON(w, true)
}
