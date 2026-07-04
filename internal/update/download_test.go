package update

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestDownloadReportsProgress(t *testing.T) {
	payload := bytes.Repeat([]byte("x"), 300*1024) // 128KB 버퍼보다 크게 → 진행률 여러 번
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dest := filepath.Join(t.TempDir(), "out.zip")
	var pcts []int
	if err := download(context.Background(), srv.URL, dest, func(p int) { pcts = append(pcts, p) }); err != nil {
		t.Fatal(err)
	}

	b, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if len(b) != len(payload) {
		t.Errorf("downloaded %d bytes, want %d", len(b), len(payload))
	}
	if len(pcts) == 0 || pcts[len(pcts)-1] != 100 {
		t.Errorf("progress = %v, want non-empty ending at 100", pcts)
	}
}

func TestDownloadHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()
	dest := filepath.Join(t.TempDir(), "out.zip")
	if err := download(context.Background(), srv.URL, dest, nil); err == nil {
		t.Error("expected error on 404")
	}
}
