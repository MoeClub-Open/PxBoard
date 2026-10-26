package plugins

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
)

func (m *Manager) installBinary(manifest plugin.Manifest, source string, binary []byte, enable bool) (err error) {
	all, err := m.List()
	if err != nil {
		return err
	}
	for _, dependent := range all {
		if minimum, needs := dependent.Dependencies[manifest.ID]; needs && !compatible(manifest.Version, minimum) {
			return fmt.Errorf("%s 需要 %s %s，不能安装 %s", dependent.Name, manifest.ID, minimum, manifest.Version)
		}
	}
	old, _ := m.Get(manifest.ID)
	dest := m.binary(manifest.ID, manifest.Version)
	if err = os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(dest), "plugin-download-*")
	if err != nil {
		return err
	}
	staged := temporary.Name()
	defer os.Remove(staged)
	if err = temporary.Chmod(0700); err == nil {
		_, err = temporary.Write(binary)
	}
	if err == nil {
		err = temporary.Sync()
	}
	err = errors.Join(err, temporary.Close())
	if err != nil {
		return err
	}
	m.stopProcess(manifest.ID)
	backup := dest + ".previous-" + plugin.ID()
	backedUp := false
	defer func() {
		if err == nil {
			if backedUp {
				_ = os.Remove(backup)
			}
			return
		}
		if backedUp {
			_ = os.Remove(dest)
			err = errors.Join(err, os.Rename(backup, dest))
		}
		if old.ID != "" {
			err = errors.Join(err, m.persist(old.Manifest, old.SourceID))
			if old.Enabled {
				err = errors.Join(err, m.enable(old.ID))
			}
		} else {
			_, restoreErr := m.Store.DB.Exec("DELETE FROM plugins WHERE id=?", manifest.ID)
			err = errors.Join(err, restoreErr)
		}
	}()
	if _, statErr := os.Stat(dest); statErr == nil {
		if err = os.Rename(dest, backup); err != nil {
			return err
		}
		backedUp = true
	}
	if err = os.Rename(staged, dest); err != nil {
		return err
	}
	if err = m.persist(manifest, source); err != nil {
		return err
	}
	if enable {
		err = m.enable(manifest.ID)
	}
	return err
}
