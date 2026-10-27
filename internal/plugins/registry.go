package plugins

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Source struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	PublicKey string `json:"publicKey"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt string `json:"updatedAt"`
	Error     string `json:"error,omitempty"`
}
type Entry struct {
	plugin.Manifest
	Signatures map[string]string `json:"signatures,omitempty"`
	SourceID   string            `json:"sourceId"`
	SourceName string            `json:"sourceName"`
	Signed     bool              `json:"signed"`
}
type Index struct {
	SchemaVersion string          `json:"schemaVersion"`
	Name          string          `json:"name"`
	Plugins       []Entry         `json:"plugins"`
	Bundles       []plugin.Record `json:"bundles,omitempty"`
}

var idPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{1,62}$`)

func validID(id string) bool { return idPattern.MatchString(id) }
func version(v string) ([3]int, bool) {
	var out [3]int
	parts := strings.Split(strings.TrimPrefix(v, "v"), ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, p := range parts {
		n, e := strconv.Atoi(p)
		if e != nil || n < 0 {
			return out, false
		}
		out[i] = n
	}
	return out, true
}
func validVersion(v string) bool { _, ok := version(v); return ok }

// An epoch permits a published version series to be reset without being treated as a downgrade.
func versionWithEpoch(manifest plugin.Manifest) string {
	return strconv.Itoa(manifest.VersionEpoch) + "!" + manifest.Version
}

func orderedVersion(value string) ([4]int, bool) {
	var out [4]int
	parts := strings.Split(value, "!")
	if len(parts) > 2 {
		return out, false
	}
	if len(parts) == 2 {
		epoch, err := strconv.Atoi(parts[0])
		if err != nil || epoch < 0 {
			return out, false
		}
		out[0], value = epoch, parts[1]
	}
	v, ok := version(value)
	if !ok {
		return out, false
	}
	copy(out[1:], v[:])
	return out, true
}
func checkCoreVersion(manifest plugin.Manifest) error {
	if manifest.MinCoreVersion == "" {
		return nil
	}
	if _, ok := orderedVersion(manifest.MinCoreVersion); !ok {
		return fmt.Errorf("插件 %s 的最低核心版本声明无效：%s", manifest.ID, manifest.MinCoreVersion)
	}
	if !compatible(strconv.Itoa(plugin.CoreVersionEpoch)+"!"+plugin.CoreVersion, manifest.MinCoreVersion) {
		return fmt.Errorf("插件 %s 需要 PxBoard 核心 %s 或更新版本，当前为 %s，请先升级核心", manifest.ID, manifest.MinCoreVersion, plugin.CoreVersion)
	}
	return nil
}
func compatible(installed, minimum string) bool {
	a, ok := orderedVersion(installed)
	if !ok {
		return false
	}
	b, ok := orderedVersion(strings.TrimPrefix(minimum, ">="))
	if !ok {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return true
}
func validURL(raw string) error {
	u, e := url.Parse(raw)
	if e != nil || u.Host == "" || u.User != nil {
		return fmt.Errorf("请输入有效的插件源 URL")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")) {
		return fmt.Errorf("在线插件源必须使用 HTTPS，本机开发可使用 HTTP")
	}
	return nil
}

var downloader = &http.Client{Timeout: 90 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
	if len(via) > 5 {
		return fmt.Errorf("重定向过多")
	}
	return validURL(req.URL.String())
}}

func fetch(raw string, limit int64) ([]byte, error) {
	if err := validURL(raw); err != nil {
		return nil, err
	}
	res, err := downloader.Get(raw)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("插件源返回 HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if int64(len(b)) > limit {
		return nil, fmt.Errorf("下载超过大小限制")
	}
	return b, err
}
func (m *Manager) Sources() ([]Source, error) {
	rows, err := m.Store.DB.Query("SELECT id,name,url,enabled,COALESCE(updated_at,''),COALESCE(public_key,'') FROM sources ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Source{}
	for rows.Next() {
		var s Source
		if err = rows.Scan(&s.ID, &s.Name, &s.URL, &s.Enabled, &s.UpdatedAt, &s.PublicKey); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
func (m *Manager) AddSource(s Source) error {
	if err := validURL(s.URL); err != nil {
		return err
	}
	if s.PublicKey != "" {
		b, e := base64.StdEncoding.DecodeString(s.PublicKey)
		if e != nil || len(b) != ed25519.PublicKeySize {
			return fmt.Errorf("发布公钥格式错误")
		}
	}
	idx, e := readIndex(s.URL)
	if e != nil {
		return e
	}
	s.ID = plugin.ID()
	if s.Name == "" {
		s.Name = idx.Name
	}
	_, e = m.Store.DB.Exec("INSERT INTO sources(id,name,url,enabled,updated_at,public_key)VALUES(?,?,?,1,?,?)", s.ID, s.Name, s.URL, store.Now(), s.PublicKey)
	return e
}
func readIndex(raw string) (Index, error) {
	b, e := fetch(raw, 4<<20)
	if e != nil {
		return Index{}, e
	}
	var idx Index
	e = json.Unmarshal(b, &idx)
	if e != nil {
		return idx, e
	}
	if idx.SchemaVersion != "1.0" {
		return idx, fmt.Errorf("不支持的插件源格式")
	}
	return idx, nil
}
func (m *Manager) Catalog() ([]Entry, []Source) {
	sources, _ := m.Sources()
	out := []Entry{}
	for i, s := range sources {
		if !s.Enabled {
			continue
		}
		idx, e := readIndex(s.URL)
		if e != nil {
			sources[i].Error = e.Error()
			continue
		}
		for _, p := range idx.Plugins {
			if !validID(p.ID) || !validVersion(p.Version) || p.VersionEpoch < 0 || p.BuildRevision < 0 || p.APIVersion != plugin.APIVersion {
				continue
			}
			p.SourceID = s.ID
			p.SourceName = s.Name
			p.Signed = s.PublicKey != ""
			out = append(out, p)
		}
		_, _ = m.Store.DB.Exec("UPDATE sources SET updated_at=? WHERE id=?", store.Now(), s.ID)
	}
	return out, sources
}
func (m *Manager) Bundles() []plugin.Record {
	sources, _ := m.Sources()
	out := []plugin.Record{}
	for _, s := range sources {
		if !s.Enabled {
			continue
		}
		idx, e := readIndex(s.URL)
		if e != nil {
			continue
		}
		for _, b := range idx.Bundles {
			b["sourceId"] = s.ID
			b["sourceName"] = s.Name
			out = append(out, b)
		}
	}
	return out
}
func (m *Manager) Install(id, source string) error {
	m.mutation.Lock()
	defer m.mutation.Unlock()
	catalog, sources := m.Catalog()
	return m.install(id, source, catalog, sources, map[string]bool{})
}
func (m *Manager) install(id, source string, catalog []Entry, sources []Source, visiting map[string]bool) error {
	if visiting[id] {
		return fmt.Errorf("插件依赖存在循环：%s", id)
	}
	visiting[id] = true
	defer delete(visiting, id)
	var entry *Entry
	for i, p := range catalog {
		if p.ID == id && p.SourceID == source {
			entry = &catalog[i]
			break
		}
	}
	if entry == nil {
		return fmt.Errorf("插件源中未找到适用版本")
	}
	p := *entry
	if err := checkCoreVersion(p.Manifest); err != nil {
		return err
	}
	old, _ := m.Get(id)
	if old.ID != "" && old.SourceID == source {
		if !compatible(versionWithEpoch(p.Manifest), versionWithEpoch(old.Manifest)) || (old.Version == p.Version && old.VersionEpoch == p.VersionEpoch && old.BuildRevision > p.BuildRevision) {
			return fmt.Errorf("插件源中的版本或发布批次早于已安装版本")
		}
	}
	if old.ID != "" && old.Version == p.Version && old.VersionEpoch == p.VersionEpoch && old.BuildRevision == p.BuildRevision && old.SourceID == source {
		if old.Enabled && old.Error == "" {
			return nil
		}
		return m.enable(id)
	}
	for dep, min := range p.Dependencies {
		installed, e := m.Get(dep)
		if e == nil && compatible(versionWithEpoch(installed.Manifest), min) {
			if !installed.Enabled || installed.Error != "" {
				if e = m.enable(dep); e != nil {
					return e
				}
			}
			continue
		}
		if e = m.install(dep, source, catalog, sources, visiting); e != nil {
			return e
		}
		installed, e = m.Get(dep)
		if e != nil || !compatible(versionWithEpoch(installed.Manifest), min) {
			return fmt.Errorf("依赖版本不满足：%s %s", dep, min)
		}
	}
	platform := runtime.GOOS + "-" + runtime.GOARCH
	artifact := p.Artifacts[platform]
	if artifact == "" {
		return fmt.Errorf("插件不支持当前平台 %s", platform)
	}
	var src Source
	for _, s := range sources {
		if s.ID == source {
			src = s
		}
	}
	base, _ := url.Parse(src.URL)
	rel, e := url.Parse(artifact)
	if e != nil {
		return e
	}
	download := base.ResolveReference(rel).String()
	b, e := fetch(download, 160<<20)
	if e != nil {
		return e
	}
	if src.PublicKey != "" {
		key, _ := base64.StdEncoding.DecodeString(src.PublicKey)
		sig, e := base64.StdEncoding.DecodeString(p.Signatures[platform])
		if e != nil || !ed25519.Verify(key, b, sig) {
			return fmt.Errorf("插件发布签名无效")
		}
	}
	return m.installBinary(p.Manifest, source, b, true)
}
