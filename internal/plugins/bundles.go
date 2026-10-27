package plugins

import (
	"fmt"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"runtime"
	"sort"
)

// BundlePlan resolves a source's bundle and dependencies before installing anything.
func (m *Manager) BundlePlan(id, sourceID string) ([]Entry, error) {
	sources, e := m.Sources()
	if e != nil {
		return nil, e
	}
	var source Source
	for _, item := range sources {
		if item.ID == sourceID && item.Enabled {
			source = item
		}
	}
	if source.ID == "" {
		return nil, fmt.Errorf("请选择已启用的插件源")
	}
	index, e := readIndex(source.URL)
	if e != nil {
		return nil, e
	}
	entries := map[string]Entry{}
	for _, entry := range index.Plugins {
		entry.SourceID = sourceID
		entry.SourceName = source.Name
		entries[entry.ID] = entry
	}
	var roots []string
	for _, bundle := range index.Bundles {
		if plugin.Text(bundle, "id") == id {
			if items, ok := bundle["plugins"].([]any); ok {
				for _, item := range items {
					if name, ok := item.(string); ok {
						roots = append(roots, name)
					}
				}
			}
		}
	}
	if len(roots) == 0 {
		return nil, fmt.Errorf("插件源没有提供 %s 功能组合", id)
	}
	plan := []Entry{}
	visiting, done := map[string]bool{}, map[string]bool{}
	var visit func(string) error
	visit = func(name string) error {
		if done[name] {
			return nil
		}
		if visiting[name] {
			return fmt.Errorf("插件依赖存在循环：%s", name)
		}
		entry, ok := entries[name]
		if !ok {
			return fmt.Errorf("插件源缺少 %s", name)
		}
		if !validID(entry.ID) || !validVersion(entry.Version) || entry.VersionEpoch < 0 || entry.BuildRevision < 0 || entry.APIVersion != plugin.APIVersion {
			return fmt.Errorf("插件声明无效：%s", name)
		}
		if e := checkCoreVersion(entry.Manifest); e != nil {
			return e
		}
		platform := runtime.GOOS + "-" + runtime.GOARCH
		if entry.Artifacts[platform] == "" {
			return fmt.Errorf("%s 暂不支持当前平台 %s", entry.Name, platform)
		}
		visiting[name] = true
		dependencies := []string{}
		for dependency := range entry.Dependencies {
			dependencies = append(dependencies, dependency)
		}
		sort.Strings(dependencies)
		for _, dependency := range dependencies {
			if e := visit(dependency); e != nil {
				return e
			}
			if !compatible(versionWithEpoch(entries[dependency].Manifest), entry.Dependencies[dependency]) {
				return fmt.Errorf("源中 %s 的依赖版本不满足 %s", name, dependency)
			}
		}
		visiting[name] = false
		done[name] = true
		plan = append(plan, entry)
		return nil
	}
	for _, name := range roots {
		if e = visit(name); e != nil {
			return nil, e
		}
	}
	return plan, nil
}

func (m *Manager) InstallPlan(plan []Entry, sourceID string, progress func(string, string, error)) error {
	m.mutation.Lock()
	defer m.mutation.Unlock()
	sources, e := m.Sources()
	if e != nil {
		return e
	}
	for _, entry := range plan {
		progress(entry.ID, "installing", nil)
		old, e := m.Get(entry.ID)
		sameVersion := old.Version == entry.Version && old.VersionEpoch == entry.VersionEpoch
		if e == nil && compatible(versionWithEpoch(old.Manifest), versionWithEpoch(entry.Manifest)) && (!sameVersion || old.SourceID != sourceID || old.BuildRevision >= entry.BuildRevision) {
			if !old.Enabled || old.Error != "" {
				e = m.enable(old.ID)
			}
		} else {
			e = m.install(entry.ID, sourceID, plan, sources, map[string]bool{})
		}
		if e != nil {
			progress(entry.ID, "failed", e)
			return e
		}
		progress(entry.ID, "ready", nil)
	}
	return nil
}
