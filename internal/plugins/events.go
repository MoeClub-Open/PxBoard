package plugins

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/MoeClub-Open/PxBoard/internal/store"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	"slices"
	"sync"
	"time"
)

func (m *Manager) Emit(source, kind string, data plugin.Record) error {
	tx, err := m.Store.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := m.Enqueue(tx, source, kind, data); err != nil {
		return err
	}
	return tx.Commit()
}

func (m *Manager) Enqueue(tx *sql.Tx, source, kind string, data plugin.Record) error {
	e := plugin.Event{ID: plugin.ID(), Type: kind, Source: source, Data: data, CreatedAt: store.Now()}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	if _, err = tx.Exec("INSERT INTO events VALUES(?,?,?,?,?)", e.ID, kind, source, string(b), e.CreatedAt); err != nil {
		return err
	}
	rows, err := tx.Query("SELECT manifest FROM plugins WHERE enabled=1")
	if err != nil {
		return err
	}
	var recipients []string
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil {
			rows.Close()
			return err
		}
		var p plugin.Manifest
		if err = json.Unmarshal([]byte(raw), &p); err != nil {
			rows.Close()
			return err
		}
		if slices.Contains(p.Events, kind) {
			recipients = append(recipients, p.ID)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range recipients {
		if _, err = tx.Exec("INSERT INTO deliveries(event_id,plugin_id,next_at)VALUES(?,?,?)", e.ID, id, e.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}
func (m *Manager) Work(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	ticks := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ticks++
			if ticks%20 == 0 {
				_ = m.Emit("core", "system.tick", plugin.Record{})
			}
			m.deliver(ctx)
			if ticks%1200 == 0 {
				_, _ = m.Store.DB.Exec("DELETE FROM events WHERE created_at < ? AND id NOT IN (SELECT event_id FROM deliveries WHERE done=0)", time.Now().AddDate(0, 0, -30).UTC().Format(time.RFC3339))
			}
		}
	}
}
func (m *Manager) deliver(ctx context.Context) {
	rows, err := m.Store.DB.Query(`SELECT id,type,source,data,created_at,plugin_id,attempts FROM (
	SELECT e.id,e.type,e.source,e.data,e.created_at,d.plugin_id,d.attempts,e.rowid sequence,ROW_NUMBER() OVER(PARTITION BY d.plugin_id ORDER BY e.rowid) position
	FROM deliveries d JOIN events e ON e.id=d.event_id WHERE d.done=0 AND d.next_at<=? AND d.attempts<10
	) WHERE position<=20 ORDER BY plugin_id,sequence`, store.Now())
	if err != nil {
		return
	}
	type delivery struct {
		event    plugin.Event
		target   string
		attempts int
	}
	pending := []delivery{}
	for rows.Next() {
		var d delivery
		var b string
		if rows.Scan(&d.event.ID, &d.event.Type, &d.event.Source, &b, &d.event.CreatedAt, &d.target, &d.attempts) == nil {
			_ = json.Unmarshal([]byte(b), &d.event.Data)
			pending = append(pending, d)
		}
	}
	rows.Close()
	groups := map[string][]delivery{}
	for _, d := range pending {
		groups[d.target] = append(groups[d.target], d)
	}
	var workers sync.WaitGroup
	for _, group := range groups {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for _, d := range group {
				p, e := m.Get(d.target)
				if e != nil || !p.Enabled {
					continue
				}
				b, _ := json.Marshal(d.event)
				res, e := m.Call(ctx, d.target, plugin.Request{Method: "POST", Path: "/_events", Body: b, Actor: plugin.Actor{Role: "service", Plugin: "core"}})
				if e == nil && res.Status >= 400 {
					e = fmt.Errorf("HTTP %d: %s", res.Status, res.Body)
				}
				if e == nil {
					_, _ = m.Store.DB.Exec("UPDATE deliveries SET done=1,error='' WHERE event_id=? AND plugin_id=?", d.event.ID, d.target)
					_, _ = m.Store.DB.Exec("UPDATE events SET data='{}' WHERE id=? AND NOT EXISTS(SELECT 1 FROM deliveries WHERE event_id=? AND done=0)", d.event.ID, d.event.ID)
				} else {
					delay := time.Duration(1<<min(d.attempts, 8)) * time.Minute
					_, _ = m.Store.DB.Exec("UPDATE deliveries SET attempts=attempts+1,error=?,next_at=? WHERE event_id=? AND plugin_id=?", e.Error(), time.Now().Add(delay).UTC().Format(time.RFC3339), d.event.ID, d.target)
				}
			}
		}()
	}
	workers.Wait()
}
