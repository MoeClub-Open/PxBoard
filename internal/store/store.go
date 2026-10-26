package store

import (
	"database/sql"
	"encoding/json"
	"github.com/MoeClub-Open/PxBoard/pkg/plugin"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"time"
)

type Store struct{ DB *sql.DB }

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
	CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS user_credentials(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,algorithm TEXT NOT NULL,salt TEXT NOT NULL,mfa_secret TEXT NOT NULL DEFAULT '');
	CREATE TABLE IF NOT EXISTS import_runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,status TEXT NOT NULL,metadata TEXT NOT NULL,created_at TEXT NOT NULL,committed_at TEXT);
	CREATE TABLE IF NOT EXISTS import_rows(run_id TEXT NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,kind TEXT NOT NULL,namespace TEXT NOT NULL,collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(run_id,kind,namespace,collection,id));
	CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS api_tokens(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,digest TEXT NOT NULL,scope TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS mutations(namespace TEXT NOT NULL,id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(namespace,id));
	CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT UNIQUE NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT,public_key TEXT NOT NULL DEFAULT '');
	CREATE TABLE IF NOT EXISTS plugins(id TEXT PRIMARY KEY,manifest TEXT NOT NULL,enabled INTEGER NOT NULL,version TEXT NOT NULL,source_id TEXT NOT NULL,installed_at TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS documents(namespace TEXT NOT NULL,collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(namespace,collection,id));
	CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,type TEXT NOT NULL,source TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS deliveries(event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,plugin_id TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',next_at TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(event_id,plugin_id));
	CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL);
	CREATE INDEX IF NOT EXISTS documents_lookup ON documents(namespace,collection,updated_at);
	CREATE INDEX IF NOT EXISTS deliveries_pending ON deliveries(done,next_at);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}
func Now() string { return time.Now().UTC().Format(time.RFC3339) }
func (s *Store) Setting(key, fallback string) string {
	var v string
	if s.DB.QueryRow("SELECT value FROM settings WHERE key=?", key).Scan(&v) != nil {
		return fallback
	}
	return v
}
func (s *Store) Set(key, value string) error {
	_, err := s.DB.Exec("INSERT INTO settings(key,value)VALUES(?,?) ON CONFLICT(key)DO UPDATE SET value=excluded.value", key, value)
	return err
}
func (s *Store) List(namespace, collection string) ([]plugin.Record, error) {
	rows, err := s.DB.Query("SELECT data FROM documents WHERE namespace=? AND collection=? ORDER BY updated_at DESC,id", namespace, collection)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []plugin.Record{}
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		var r plugin.Record
		if err = json.Unmarshal([]byte(raw), &r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Store) Put(namespace, collection, id string, r plugin.Record) error {
	r["id"] = id
	b, err := json.Marshal(r)
	if err != nil {
		return err
	}
	_, err = s.DB.Exec("INSERT INTO documents(namespace,collection,id,data,updated_at)VALUES(?,?,?,?,?) ON CONFLICT(namespace,collection,id)DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at", namespace, collection, id, string(b), Now())
	return err
}
func (s *Store) Delete(namespace, collection, id string) error {
	_, err := s.DB.Exec("DELETE FROM documents WHERE namespace=? AND collection=? AND id=?", namespace, collection, id)
	return err
}
func (s *Store) Increment(namespace, collection, id, field string, amount float64, operation string) (plugin.Record, error) {
	tx, e := s.DB.Begin()
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	result, e := tx.Exec("INSERT OR IGNORE INTO mutations(namespace,id,created_at)VALUES(?,?,?)", namespace, operation, Now())
	if e != nil {
		return nil, e
	}
	changed, e := result.RowsAffected()
	if e != nil {
		return nil, e
	}
	var raw string
	row := plugin.Record{"id": id}
	e = tx.QueryRow("SELECT data FROM documents WHERE namespace=? AND collection=? AND id=?", namespace, collection, id).Scan(&raw)
	if e != nil && e != sql.ErrNoRows {
		return nil, e
	}
	if e == nil {
		if e = json.Unmarshal([]byte(raw), &row); e != nil {
			return nil, e
		}
	}
	if changed > 0 {
		row[field] = plugin.Number(row, field) + amount
		b, e := json.Marshal(row)
		if e != nil {
			return nil, e
		}
		_, e = tx.Exec("INSERT INTO documents VALUES(?,?,?,?,?) ON CONFLICT(namespace,collection,id)DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at", namespace, collection, id, string(b), Now())
		if e != nil {
			return nil, e
		}
	}
	if e = tx.Commit(); e != nil {
		return nil, e
	}
	return row, nil
}
func (s *Store) Log(actor, action, target string) {
	_, _ = s.DB.Exec("INSERT INTO activity VALUES(?,?,?,?,?)", plugin.ID(), actor, action, target, Now())
}
