package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"sync"
)

type Installed struct {
	plugin.Manifest
	Enabled     bool   `json:"enabled"`
	SourceID    string `json:"sourceId"`
	InstalledAt string `json:"installedAt"`
	Error       string `json:"error,omitempty"`
}
type Manager struct {
	Store        *store.Store
	Dir, BaseURL string
	mu           sync.RWMutex
	mutation     sync.Mutex
	running      map[string]*Process
}

func New(s *store.Store, dir, base string) *Manager {
	return &Manager{Store: s, Dir: dir, BaseURL: base, running: map[string]*Process{}}
}
func (m *Manager) List() ([]Installed, error) {
	rows, err := m.Store.DB.Query("SELECT manifest,enabled,source_id,installed_at FROM plugins ORDER BY id")
	if err != nil {
		return nil, err
	}
	out := []Installed{}
	for rows.Next() {
		var p Installed
		var raw string
		if err = rows.Scan(&raw, &p.Enabled, &p.SourceID, &p.InstalledAt); err != nil {
			rows.Close()
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &p.Manifest); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, p)
	}
	err = rows.Err()
	rows.Close()
	m.mu.RLock()
	defer m.mu.RUnlock()
	for i, p := range out {
		if proc := m.running[p.ID]; proc != nil {
			out[i].Error = proc.Error()
		} else if p.Enabled {
			out[i].Error = "进程未运行，请重启"
		}
	}
	return out, err
}
func (m *Manager) Get(id string) (Installed, error) {
	list, err := m.List()
	if err != nil {
		return Installed{}, err
	}
	for _, p := range list {
		if p.ID == id {
			return p, nil
		}
	}
	return Installed{}, fmt.Errorf("插件未安装")
}
func (m *Manager) binary(id, version string) string {
	n := "plugin"
	if runtime.GOOS == "windows" {
		n += ".exe"
	}
	return filepath.Join(m.Dir, id, version, n)
}
func (m *Manager) Enable(id string) error {
	m.mutation.Lock()
	defer m.mutation.Unlock()
	return m.enable(id)
}
func (m *Manager) enable(id string) error {
	p, err := m.Get(id)
	if err != nil {
		return err
	}
	if err = checkCoreVersion(p.Manifest); err != nil {
		return err
	}
	for dep, min := range p.Dependencies {
		d, err := m.Get(dep)
		if err != nil || !d.Enabled || d.Error != "" || !compatible(d.Version, min) {
			return fmt.Errorf("请先启用 %s (%s)", dep, min)
		}
	}
	proc, err := start(m.binary(id, p.Version), id, m.BaseURL)
	if err != nil {
		return err
	}
	if res, e := proc.Call(context.Background(), plugin.Request{Method: "GET", Path: "/_health"}); e != nil || res.Status != 200 {
		proc.Stop()
		return fmt.Errorf("插件启动失败，请检查版本与平台")
	}
	m.mu.RLock()
	old := m.running[id]
	m.mu.RUnlock()
	if old != nil {
		old.Stop()
	}
	m.mu.Lock()
	m.running[id] = proc
	m.mu.Unlock()
	_, err = m.Store.DB.Exec("UPDATE plugins SET enabled=1 WHERE id=?", id)
	return err
}
func (m *Manager) Disable(id string) error {
	m.mutation.Lock()
	defer m.mutation.Unlock()
	return m.disable(id)
}
func (m *Manager) disable(id string) error {
	if _, err := m.Get(id); err != nil {
		return err
	}
	all, err := m.List()
	if err != nil {
		return err
	}
	for _, p := range all {
		if _, needs := p.Dependencies[id]; needs && p.Enabled {
			return fmt.Errorf("请先停用依赖它的插件：%s", p.Name)
		}
	}
	m.stopProcess(id)
	_, err = m.Store.DB.Exec("UPDATE plugins SET enabled=0 WHERE id=?", id)
	return err
}
func (m *Manager) Remove(id string) error {
	m.mutation.Lock()
	defer m.mutation.Unlock()
	all, err := m.List()
	if err != nil {
		return err
	}
	for _, p := range all {
		if _, needs := p.Dependencies[id]; needs {
			return fmt.Errorf("请先卸载依赖它的插件：%s", p.Name)
		}
	}
	if err := m.disable(id); err != nil {
		return err
	}
	_, err = m.Store.DB.Exec("DELETE FROM plugins WHERE id=?", id)
	return err
}
func (m *Manager) Boot() {
	all, _ := m.List()
	pending := all
	for len(pending) > 0 {
		next := []Installed{}
		for _, p := range pending {
			if p.Enabled {
				if err := m.Enable(p.ID); err != nil {
					next = append(next, p)
				}
			}
		}
		if len(next) == len(pending) {
			break
		}
		pending = next
	}
}
func (m *Manager) Close() {
	m.mutation.Lock()
	defer m.mutation.Unlock()
	m.mu.RLock()
	running := m.running
	m.mu.RUnlock()
	for _, p := range running {
		p.Stop()
	}
	m.mu.Lock()
	m.running = map[string]*Process{}
	m.mu.Unlock()
}
func (m *Manager) stopProcess(id string) {
	m.mu.RLock()
	proc := m.running[id]
	m.mu.RUnlock()
	if proc != nil {
		proc.Stop()
	}
	m.mu.Lock()
	delete(m.running, id)
	m.mu.Unlock()
}
func (m *Manager) Authenticate(token string) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for id, p := range m.running {
		if token == p.token {
			return id, true
		}
	}
	return "", false
}
func (m *Manager) Permission(id, permission string) bool {
	p, err := m.Get(id)
	return err == nil && p.Enabled && slices.Contains(p.Permissions, permission)
}
func (m *Manager) Call(ctx context.Context, id string, req plugin.Request) (plugin.Response, error) {
	m.mu.RLock()
	proc := m.running[id]
	m.mu.RUnlock()
	if proc == nil {
		return plugin.Response{}, fmt.Errorf("插件未启用")
	}
	req.ID = plugin.ID()
	return proc.Call(ctx, req)
}
func (m *Manager) LocalInstall(manifest plugin.Manifest, binary string) error {
	m.mutation.Lock()
	defer m.mutation.Unlock()
	if !validID(manifest.ID) || manifest.APIVersion != plugin.APIVersion || !validVersion(manifest.Version) {
		return fmt.Errorf("插件标识或版本无效")
	}
	if err := checkCoreVersion(manifest); err != nil {
		return err
	}
	b, err := os.ReadFile(binary)
	if err != nil {
		return err
	}
	old, _ := m.Get(manifest.ID)
	return m.installBinary(manifest, "local", b, old.Enabled)
}
func (m *Manager) persist(p plugin.Manifest, source string) error {
	b, _ := json.Marshal(p)
	_, err := m.Store.DB.Exec("INSERT INTO plugins VALUES(?,?,0,?,?,?) ON CONFLICT(id)DO UPDATE SET manifest=excluded.manifest,version=excluded.version,source_id=excluded.source_id", p.ID, string(b), p.Version, source, store.Now())
	return err
}
