package store

import (
	"database/sql"
	"sync"

	_ "modernc.org/sqlite"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

// SQLiteRecorder persists messages for explicitly enabled topics.
type SQLiteRecorder struct {
	db      *sql.DB
	mu      sync.RWMutex
	enabled map[string]bool
}

// NewSQLiteRecorder opens (creating if needed) the recording DB.
func NewSQLiteRecorder(path string) (*SQLiteRecorder, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS messages (
		topic TEXT NOT NULL, payload BLOB, qos INTEGER, retained INTEGER, ts INTEGER
	); CREATE INDEX IF NOT EXISTS idx_topic_ts ON messages(topic, ts);`)
	if err != nil {
		return nil, err
	}
	return &SQLiteRecorder{db: db, enabled: map[string]bool{}}, nil
}

// Enable turns on recording for a topic.
func (r *SQLiteRecorder) Enable(topic string) {
	r.mu.Lock()
	r.enabled[topic] = true
	r.mu.Unlock()
}

// Disable turns off recording for a topic.
func (r *SQLiteRecorder) Disable(topic string) {
	r.mu.Lock()
	delete(r.enabled, topic)
	r.mu.Unlock()
}

// Record persists a message if its topic is enabled.
func (r *SQLiteRecorder) Record(m mqtt.Message) {
	r.mu.RLock()
	on := r.enabled[m.Topic]
	r.mu.RUnlock()
	if !on {
		return
	}
	_, _ = r.db.Exec(`INSERT INTO messages(topic,payload,qos,retained,ts) VALUES(?,?,?,?,?)`,
		m.Topic, m.Payload, m.QoS, m.Retained, m.Timestamp.UnixNano())
}

// Query returns up to `limit` most-recent persisted messages for a topic.
func (r *SQLiteRecorder) Query(topic string, limit int) ([]mqtt.Message, error) {
	rows, err := r.db.Query(`SELECT payload,qos,retained,ts FROM messages WHERE topic=? ORDER BY ts DESC LIMIT ?`, topic, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []mqtt.Message
	for rows.Next() {
		var m mqtt.Message
		var ret int
		var ts int64
		if err := rows.Scan(&m.Payload, &m.QoS, &ret, &ts); err != nil {
			return nil, err
		}
		m.Topic = topic
		m.Retained = ret != 0
		out = append(out, m)
	}
	return out, rows.Err()
}

// Close closes the DB.
func (r *SQLiteRecorder) Close() error { return r.db.Close() }
