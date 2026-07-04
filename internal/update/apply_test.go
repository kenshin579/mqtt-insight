package update

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// zipOfApp builds an in-memory zip containing Name.app/Contents/MacOS/marker.
func zipOfApp(t *testing.T, appName, marker string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	fh := &zip.FileHeader{Name: appName + "/Contents/MacOS/marker", Method: zip.Deflate}
	fh.SetMode(0o755)
	fw, err := w.CreateHeader(fh)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write([]byte(marker)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestApplyEndToEnd(t *testing.T) {
	payload := zipOfApp(t, "mqtt-insight.app", "new")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	appPath := filepath.Join(dir, "mqtt-insight.app")
	makeApp(t, appPath, "old")

	var lastPct int
	if err := Apply(context.Background(), srv.URL, appPath, func(p int) { lastPct = p }); err != nil {
		t.Fatal(err)
	}
	if got := readMarker(t, appPath); got != "new" {
		t.Errorf("marker = %q, want new", got)
	}
	if got := readMarker(t, appPath+".bak"); got != "old" {
		t.Errorf("bak marker = %q, want old", got)
	}
	if lastPct != 100 {
		t.Errorf("last progress = %d, want 100", lastPct)
	}
	// 스테이징 임시 디렉터리가 남지 않아야 한다
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.Name() != "mqtt-insight.app" && e.Name() != "mqtt-insight.app.bak" {
			t.Errorf("unexpected leftover: %s", e.Name())
		}
	}
}

func TestApplyNoAppInArchive(t *testing.T) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	fw, _ := w.Create("README.txt")
	_, _ = fw.Write([]byte("no app here"))
	_ = w.Close()
	payload := buf.Bytes()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	appPath := filepath.Join(dir, "mqtt-insight.app")
	makeApp(t, appPath, "old")

	if err := Apply(context.Background(), srv.URL, appPath, nil); err == nil {
		t.Fatal("expected error for archive without .app")
	}
	// 원본 앱은 그대로여야 한다
	if got := readMarker(t, appPath); got != "old" {
		t.Errorf("marker = %q, want old (untouched)", got)
	}
	// 실패 경로에서도 스테이징 임시 디렉터리가 남지 않아야 한다
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.Name() != "mqtt-insight.app" {
			t.Errorf("unexpected leftover: %s", e.Name())
		}
	}
}
