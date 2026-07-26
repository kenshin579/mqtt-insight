package store

import (
	"testing"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/mqtt"
)

func TestTreeInsertBuildsHierarchy(t *testing.T) {
	tr := NewTree()
	tr.Insert(mqtt.Message{Topic: "sensors/room1/temp", Payload: []byte("23.4"), Timestamp: time.Unix(1, 0)})
	tr.Insert(mqtt.Message{Topic: "sensors/room1/humid", Payload: []byte("61"), Timestamp: time.Unix(2, 0)})

	root := tr.Snapshot()
	sensors := findChild(root, "sensors")
	if sensors == nil {
		t.Fatal("expected 'sensors' node")
	}
	room1 := findChild(sensors, "room1")
	if room1 == nil || len(room1.Children) != 2 {
		t.Fatalf("expected room1 with 2 children, got %+v", room1)
	}
}

func TestTreeInsertUpdatesLeafStats(t *testing.T) {
	tr := NewTree()
	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("1"), Timestamp: time.Unix(1, 0)})
	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("2"), Timestamp: time.Unix(2, 0)})

	root := tr.Snapshot()
	leaf := findChild(findChild(root, "a"), "b")
	if leaf.MessageCount != 2 {
		t.Fatalf("want count 2, got %d", leaf.MessageCount)
	}
	if leaf.Preview != "2" {
		t.Fatalf("want last preview 2, got %q", leaf.Preview)
	}
}

func TestTreeRevisionTracksMutationsNotReads(t *testing.T) {
	tr := NewTree()
	start := tr.Revision()

	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("1"), Timestamp: time.Unix(1, 0)})
	afterInsert := tr.Revision()
	if afterInsert == start {
		t.Fatal("Insert must advance the revision")
	}

	tr.Snapshot()
	if tr.Revision() != afterInsert {
		t.Fatal("Snapshot must not advance the revision")
	}

	// Republishing to an existing leaf changes Preview/MessageCount/LastSeen
	// without creating any node — the revision must still advance, or the
	// emitter would skip real updates on exactly the busiest topics.
	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("2"), Timestamp: time.Unix(2, 0)})
	afterSecondInsert := tr.Revision()
	if afterSecondInsert == afterInsert {
		t.Fatal("Insert on an existing leaf must advance the revision")
	}

	tr.Clear()
	if tr.Revision() == afterSecondInsert {
		t.Fatal("Clear must advance the revision so the emptied tree is emitted")
	}
}

func TestTreeSnapshotWithRevisionMatchesRevision(t *testing.T) {
	tr := NewTree()
	tr.Insert(mqtt.Message{Topic: "a/b", Payload: []byte("1"), Timestamp: time.Unix(1, 0)})

	snap, rev := tr.SnapshotWithRevision()
	if rev != tr.Revision() {
		t.Fatalf("want revision %d, got %d", tr.Revision(), rev)
	}
	leaf := findChild(findChild(snap, "a"), "b")
	if leaf == nil || leaf.Preview != "1" {
		t.Fatalf("want snapshot to contain the insert, got %+v", leaf)
	}
}

func findChild(n *Node, name string) *Node {
	if n == nil {
		return nil
	}
	for _, c := range n.Children {
		if c.Name == name {
			return c
		}
	}
	return nil
}
