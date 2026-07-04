package update

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

const fakeRelease = `{
  "tag_name": "v0.3.0",
  "html_url": "https://github.com/kenshin579/mqtt-insight/releases/tag/v0.3.0",
  "assets": [
    {"name": "mqtt-insight-v0.3.0-macos-universal.zip", "browser_download_url": "https://example.com/mac.zip"},
    {"name": "mqtt-insight-v0.3.0-windows-amd64-installer.exe", "browser_download_url": "https://example.com/win.exe"}
  ]
}`

func fakeAPI(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
}

func TestCheckNewerVersion(t *testing.T) {
	srv := fakeAPI(t, 200, fakeRelease)
	defer srv.Close()
	info, err := Check(context.Background(), srv.URL, "v0.2.0", "darwin")
	if err != nil {
		t.Fatal(err)
	}
	if info == nil {
		t.Fatal("expected update info, got nil")
	}
	if info.Version != "v0.3.0" {
		t.Errorf("Version = %q, want v0.3.0", info.Version)
	}
	if info.ReleaseURL != "https://github.com/kenshin579/mqtt-insight/releases/tag/v0.3.0" {
		t.Errorf("ReleaseURL = %q", info.ReleaseURL)
	}
	if info.AssetURL != "https://example.com/mac.zip" {
		t.Errorf("AssetURL = %q, want mac zip", info.AssetURL)
	}
}

func TestCheckUpToDate(t *testing.T) {
	srv := fakeAPI(t, 200, fakeRelease)
	defer srv.Close()
	info, err := Check(context.Background(), srv.URL, "v0.3.0", "darwin")
	if err != nil {
		t.Fatal(err)
	}
	if info != nil {
		t.Errorf("expected nil (up to date), got %+v", info)
	}
}

func TestCheckWindowsHasNoAsset(t *testing.T) {
	// Windows는 자기교체 미지원 — assetURL 빈 문자열로 폴백을 유도한다.
	srv := fakeAPI(t, 200, fakeRelease)
	defer srv.Close()
	info, err := Check(context.Background(), srv.URL, "v0.2.0", "windows")
	if err != nil {
		t.Fatal(err)
	}
	if info == nil || info.AssetURL != "" {
		t.Errorf("expected info with empty AssetURL, got %+v", info)
	}
}

func TestCheckAPIError(t *testing.T) {
	srv := fakeAPI(t, 403, `{"message":"rate limited"}`)
	defer srv.Close()
	if _, err := Check(context.Background(), srv.URL, "v0.2.0", "darwin"); err == nil {
		t.Error("expected error on non-200 status")
	}
}
