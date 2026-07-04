# 인앱 업데이트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 시작 시 GitHub 최신 릴리스를 감지해 배지로 알리고, 버튼 한 번으로 macOS `.app` 번들을 다운로드·교체·재시작한다 (Windows·예외 상황은 릴리스 페이지 열기 폴백).

**Architecture:** 신규 Go 패키지 `internal/update/`가 감지(GitHub API)·다운로드·zip 추출·번들 swap을 담당하고, `app.go`가 startup 체크 goroutine + `GetUpdateInfo`/`ApplyUpdate` 바인딩으로 노출한다. 프론트는 이벤트(`update:available`/`update:progress`/`update:error`) + mount 시 pull(`GetUpdateInfo`) 병용으로 레이스 없이 상태를 받아 ⚙ 배지와 설정 모달 푸터 버튼을 그린다.

**Tech Stack:** Go 표준 라이브러리만 (net/http, archive/zip) — 외부 의존성 0. 프론트는 기존 zustand/이벤트 브릿지 패턴.

**Spec:** `docs/superpowers/specs/2026-07-05-in-app-update-design.md`

**작업 브랜치:** `feature/in-app-update` (이미 생성됨, 스펙 커밋 포함)

---

## 파일 구조

**신규 (Go — `internal/update/`, 전부 `package update`)**

| 파일 | 책임 |
|---|---|
| `semver.go` | `vX.Y.Z` 태그 비교 (`IsNewer`) |
| `bundle.go` | 실행 경로 → `.app` 루트 역산(`BundlePath`), translocation 판정(`IsTranslocated`) |
| `check.go` | GitHub API 호출·자산 선택 (`Check`, `Info`, `DefaultAPIURL`) |
| `download.go` | 진행률 콜백 붙은 HTTP 다운로드 (`download`) |
| `extract.go` | symlink·퍼미션 보존 zip 추출 (`extractZip`) |
| `swap.go` | 번들 rename swap + rollback (`swapBundle`), `.bak` 정리 (`CleanupBak`) |
| `apply.go` | 오케스트레이션 (`Apply`, `findApp`) |
| `relaunch_darwin.go` / `relaunch_other.go` | `open -n` 재실행 (`Relaunch`) — 빌드 태그 분리 |

**수정 (Go)**: `internal/config/config.go` (Settings에 `CheckUpdates`), `app.go` (startup 체크·바인딩)

**수정 (프론트)**: `types.ts` (`UpdateInfo`), `store/appStore.ts` (update 상태 3종), `bridge/events.ts` (이벤트 3종), `lib/i18n.ts` (키 6개×2언어), `App.tsx` (⚙ 배지 + pull), `App.css` (배지·업데이트 행 CSS), `components/SettingsModal.tsx` (업데이트 행 + 토글)

**수정 (문서)**: `docs/MANUAL_TESTING.md` (체크리스트), 스펙 §3 (이벤트+pull 병용 반영)

**테스트 실행 명령** (이 프로젝트 관례):
- Go 단일 패키지: `go test ./internal/update/ -v`
- 프론트: `cd frontend && npx vitest run && npx tsc --noEmit`
- 전체 게이트: `make test`

---

### Task 1: semver 비교 (`internal/update/semver.go`)

**Files:**
- Create: `internal/update/semver.go`
- Test: `internal/update/semver_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package update

import "testing"

func TestIsNewer(t *testing.T) {
	cases := []struct {
		current, latest string
		want            bool
	}{
		{"v0.2.0", "v0.3.0", true},
		{"v0.2.0", "v0.2.0", false},
		{"v0.3.0", "v0.2.0", false},
		{"v0.9.0", "v0.10.0", true},  // 숫자 비교 (문자열 비교면 실패)
		{"v1.0.0", "v1.0.1", true},
		{"v1.0", "v1.0.1", true},     // 누락 파트 = 0
		{"0.2.0", "v0.3.0", true},    // v prefix 없어도 허용
		{"v1.0.0", "v1.0.0-rc1", false}, // suffix는 숫자 prefix만 취함 → 동일
	}
	for _, c := range cases {
		if got := IsNewer(c.current, c.latest); got != c.want {
			t.Errorf("IsNewer(%q, %q) = %v, want %v", c.current, c.latest, got, c.want)
		}
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/update/ -run TestIsNewer -v`
Expected: FAIL (컴파일 에러 — `IsNewer` 미정의). 디렉터리가 없다는 에러면 테스트 파일이 `internal/update/`에 있는지 확인.

- [ ] **Step 3: 구현**

```go
// Package update implements the in-app update flow: GitHub release check,
// download, and macOS .app bundle self-replacement.
// 설계: docs/superpowers/specs/2026-07-05-in-app-update-design.md
package update

import (
	"strconv"
	"strings"
)

// IsNewer reports whether tag latest is strictly newer than tag current.
// Tags look like "v0.2.0"; "v" prefix optional, missing parts count as 0.
func IsNewer(current, latest string) bool {
	cur, lat := parts(current), parts(latest)
	for i := 0; i < 3; i++ {
		if lat[i] != cur[i] {
			return lat[i] > cur[i]
		}
	}
	return false
}

// parts parses "v1.2.3" into [1 2 3]. 각 파트는 숫자 prefix만 취한다
// ("10-rc2" → 10) — 이 저장소 태그는 vX.Y.Z만 쓰므로 그 이상은 YAGNI.
func parts(tag string) [3]int {
	tag = strings.TrimPrefix(strings.TrimSpace(tag), "v")
	var out [3]int
	for i, p := range strings.SplitN(tag, ".", 3) {
		j := 0
		for j < len(p) && p[j] >= '0' && p[j] <= '9' {
			j++
		}
		n, _ := strconv.Atoi(p[:j])
		out[i] = n
	}
	return out
}
```

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/update/ -run TestIsNewer -v`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add internal/update/semver.go internal/update/semver_test.go
git commit -m "feat(update): add version tag comparison"
```

---

### Task 2: 번들 경로 · translocation 판정 (`internal/update/bundle.go`)

**Files:**
- Create: `internal/update/bundle.go`
- Test: `internal/update/bundle_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package update

import "testing"

func TestBundlePath(t *testing.T) {
	cases := []struct {
		exe    string
		want   string
		wantOK bool
	}{
		{"/Applications/mqtt-insight.app/Contents/MacOS/mqtt-insight", "/Applications/mqtt-insight.app", true},
		{"/Users/x/Downloads/mqtt-insight.app/Contents/MacOS/mqtt-insight", "/Users/x/Downloads/mqtt-insight.app", true},
		{"/Users/x/go/bin/wails-dev-binary", "", false}, // wails dev 등 번들 밖
	}
	for _, c := range cases {
		got, ok := BundlePath(c.exe)
		if got != c.want || ok != c.wantOK {
			t.Errorf("BundlePath(%q) = (%q, %v), want (%q, %v)", c.exe, got, ok, c.want, c.wantOK)
		}
	}
}

func TestIsTranslocated(t *testing.T) {
	if !IsTranslocated("/private/var/folders/ab/T/AppTranslocation/XYZ/d/mqtt-insight.app/Contents/MacOS/mqtt-insight") {
		t.Error("translocated path not detected")
	}
	if IsTranslocated("/Applications/mqtt-insight.app/Contents/MacOS/mqtt-insight") {
		t.Error("normal path misdetected as translocated")
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/update/ -run 'TestBundlePath|TestIsTranslocated' -v`
Expected: FAIL (컴파일 에러 — 함수 미정의)

- [ ] **Step 3: 구현**

```go
package update

import "strings"

// BundlePath derives the .app bundle root from an executable path like
// "/Applications/mqtt-insight.app/Contents/MacOS/mqtt-insight".
// ok=false면 .app 번들 밖에서 실행 중(wails dev 등) — 자기교체 불가.
func BundlePath(exe string) (string, bool) {
	i := strings.Index(exe, ".app/Contents/MacOS/")
	if i < 0 {
		return "", false
	}
	return exe[:i+len(".app")], true
}

// IsTranslocated reports whether exe runs under macOS App Translocation
// (quarantine 상태 실행 시의 읽기 전용 임시 마운트) — 자기교체 불가.
func IsTranslocated(exe string) bool {
	return strings.Contains(exe, "/AppTranslocation/")
}
```

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/update/ -run 'TestBundlePath|TestIsTranslocated' -v`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add internal/update/bundle.go internal/update/bundle_test.go
git commit -m "feat(update): derive .app bundle path and detect translocation"
```

---

### Task 3: GitHub 릴리스 체크 (`internal/update/check.go`)

**Files:**
- Create: `internal/update/check.go`
- Test: `internal/update/check_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

`httptest`로 GitHub API 응답을 흉내 낸다. `Check`는 테스트 주입을 위해 apiURL과 goos를 파라미터로 받는다.

```go
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
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/update/ -run TestCheck -v`
Expected: FAIL (컴파일 에러 — `Check`, `Info` 미정의)

- [ ] **Step 3: 구현**

```go
package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// DefaultAPIURL is the GitHub "latest release" endpoint for this repo.
const DefaultAPIURL = "https://api.github.com/repos/kenshin579/mqtt-insight/releases/latest"

// Info describes an available update. JSON 태그 그대로 프론트에 전달된다.
type Info struct {
	Version       string `json:"version"`
	ReleaseURL    string `json:"releaseURL"`
	AssetURL      string `json:"assetURL"`       // "" = 플랫폼 자산 없음 → 폴백
	CanSelfUpdate bool   `json:"canSelfUpdate"` // 호출자(app.go)가 실행 환경 보고 채움
}

type release struct {
	TagName string  `json:"tag_name"`
	HTMLURL string  `json:"html_url"`
	Assets  []asset `json:"assets"`
}

type asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

// Check queries apiURL for the latest release. Returns (nil, nil) when
// current is already up to date. goos는 자산 선택용(테스트 주입 가능).
func Check(ctx context.Context, apiURL, current, goos string) (*Info, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api: %s", res.Status)
	}
	var rel release
	if err := json.NewDecoder(res.Body).Decode(&rel); err != nil {
		return nil, err
	}
	if !IsNewer(current, rel.TagName) {
		return nil, nil
	}
	return &Info{
		Version:    rel.TagName,
		ReleaseURL: rel.HTMLURL,
		AssetURL:   assetFor(rel.Assets, goos),
	}, nil
}

// assetFor picks the platform's self-update asset URL ("" = none).
func assetFor(assets []asset, goos string) string {
	if goos != "darwin" { // Windows 자기교체는 후속 버전 (스펙 §6)
		return ""
	}
	for _, a := range assets {
		if strings.HasSuffix(a.Name, "-macos-universal.zip") {
			return a.URL
		}
	}
	return ""
}
```

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/update/ -run TestCheck -v`
Expected: PASS (4개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add internal/update/check.go internal/update/check_test.go
git commit -m "feat(update): check GitHub latest release and pick platform asset"
```

---

### Task 4: zip 추출 (`internal/update/extract.go`)

**Files:**
- Create: `internal/update/extract.go`
- Test: `internal/update/extract_test.go`

`.app` 번들은 실행 퍼미션과 (Frameworks 등의) symlink를 포함할 수 있어 둘 다 보존해야 한다. zip-slip(경로 탈출)도 막는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package update

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

// buildZip writes a zip with a dir, an executable file, and a symlink.
func buildZip(t *testing.T, path string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	w := zip.NewWriter(f)

	// 디렉터리 엔트리
	dh := &zip.FileHeader{Name: "Demo.app/Contents/MacOS/"}
	dh.SetMode(os.ModeDir | 0o755)
	if _, err := w.CreateHeader(dh); err != nil {
		t.Fatal(err)
	}

	// 실행 파일 (0755)
	fh := &zip.FileHeader{Name: "Demo.app/Contents/MacOS/demo", Method: zip.Deflate}
	fh.SetMode(0o755)
	fw, err := w.CreateHeader(fh)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write([]byte("#!/bin/sh\necho hi\n")); err != nil {
		t.Fatal(err)
	}

	// symlink (내용 = 링크 대상)
	sh := &zip.FileHeader{Name: "Demo.app/Contents/link"}
	sh.SetMode(os.ModeSymlink | 0o777)
	sw, err := w.CreateHeader(sh)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sw.Write([]byte("MacOS/demo")); err != nil {
		t.Fatal(err)
	}

	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestExtractZipPreservesModeAndSymlink(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "a.zip")
	buildZip(t, zipPath)

	dest := filepath.Join(dir, "out")
	if err := extractZip(zipPath, dest); err != nil {
		t.Fatal(err)
	}

	fi, err := os.Stat(filepath.Join(dest, "Demo.app/Contents/MacOS/demo"))
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o755 {
		t.Errorf("perm = %o, want 755", fi.Mode().Perm())
	}

	link, err := os.Readlink(filepath.Join(dest, "Demo.app/Contents/link"))
	if err != nil {
		t.Fatal(err)
	}
	if link != "MacOS/demo" {
		t.Errorf("symlink target = %q, want MacOS/demo", link)
	}
}

func TestExtractZipRejectsPathEscape(t *testing.T) {
	dir := t.TempDir()
	zipPath := filepath.Join(dir, "evil.zip")
	f, err := os.Create(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	w := zip.NewWriter(f)
	ew, err := w.Create("../evil.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = ew.Write([]byte("x"))
	_ = w.Close()
	_ = f.Close()

	if err := extractZip(zipPath, filepath.Join(dir, "out")); err == nil {
		t.Error("expected error for zip entry escaping destination")
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/update/ -run TestExtract -v`
Expected: FAIL (컴파일 에러 — `extractZip` 미정의)

- [ ] **Step 3: 구현**

```go
package update

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// extractZip extracts src into destDir, preserving file modes and symlinks
// (.app 번들의 실행 퍼미션·Frameworks symlink 보존이 필수).
func extractZip(src, destDir string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	cleanDest := filepath.Clean(destDir)
	for _, f := range r.File {
		target := filepath.Join(destDir, f.Name)
		if !strings.HasPrefix(target, cleanDest+string(os.PathSeparator)) {
			return fmt.Errorf("zip entry escapes destination: %s", f.Name)
		}
		mode := f.Mode()
		switch {
		case mode.IsDir():
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case mode&os.ModeSymlink != 0:
			linkTarget, err := readEntry(f)
			if err != nil {
				return err
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			if err := os.Symlink(string(linkTarget), target); err != nil {
				return err
			}
		default:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			if err := writeEntry(f, target, mode.Perm()); err != nil {
				return err
			}
		}
	}
	return nil
}

func readEntry(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

func writeEntry(f *zip.File, target string, perm os.FileMode) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	w, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	defer w.Close()
	_, err = io.Copy(w, rc)
	return err
}
```

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/update/ -run TestExtract -v`
Expected: PASS (2개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add internal/update/extract.go internal/update/extract_test.go
git commit -m "feat(update): extract release zip preserving modes and symlinks"
```

---

### Task 5: 진행률 다운로드 (`internal/update/download.go`)

**Files:**
- Create: `internal/update/download.go`
- Test: `internal/update/download_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
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
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/update/ -run TestDownload -v`
Expected: FAIL (컴파일 에러 — `download` 미정의)

- [ ] **Step 3: 구현**

```go
package update

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
)

// download fetches url into dest, reporting progress 0–100.
// Content-Length가 없으면 진행률 콜백은 호출되지 않는다(베스트 에포트).
func download(ctx context.Context, url, dest string, progress func(int)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download: %s", res.Status)
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	var written int64
	total := res.ContentLength
	buf := make([]byte, 128*1024)
	for {
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			if _, werr := out.Write(buf[:n]); werr != nil {
				return werr
			}
			written += int64(n)
			if total > 0 && progress != nil {
				progress(int(written * 100 / total))
			}
		}
		if rerr == io.EOF {
			return nil
		}
		if rerr != nil {
			return rerr
		}
	}
}
```

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/update/ -run TestDownload -v`
Expected: PASS (2개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add internal/update/download.go internal/update/download_test.go
git commit -m "feat(update): download asset with progress reporting"
```

---

### Task 6: 번들 swap · rollback · `.bak` 정리 (`internal/update/swap.go`)

**Files:**
- Create: `internal/update/swap.go`
- Test: `internal/update/swap_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

```go
package update

import (
	"os"
	"path/filepath"
	"testing"
)

// makeApp creates a fake .app dir with a marker file identifying its version.
func makeApp(t *testing.T, path, marker string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(path, "Contents/MacOS"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "Contents/MacOS/marker"), []byte(marker), 0o755); err != nil {
		t.Fatal(err)
	}
}

func readMarker(t *testing.T, appPath string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(appPath, "Contents/MacOS/marker"))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestSwapBundle(t *testing.T) {
	dir := t.TempDir()
	cur := filepath.Join(dir, "mqtt-insight.app")
	next := filepath.Join(dir, "staging", "mqtt-insight.app")
	makeApp(t, cur, "old")
	makeApp(t, next, "new")

	if err := swapBundle(next, cur); err != nil {
		t.Fatal(err)
	}
	if got := readMarker(t, cur); got != "new" {
		t.Errorf("app marker = %q, want new", got)
	}
	if got := readMarker(t, cur+".bak"); got != "old" {
		t.Errorf("backup marker = %q, want old", got)
	}
}

func TestSwapBundleRollsBackOnFailure(t *testing.T) {
	dir := t.TempDir()
	cur := filepath.Join(dir, "mqtt-insight.app")
	makeApp(t, cur, "old")
	missing := filepath.Join(dir, "no-such.app") // 두 번째 rename 실패 유도

	if err := swapBundle(missing, cur); err == nil {
		t.Fatal("expected error")
	}
	// rollback: 원래 앱이 제자리에 복구되어야 한다
	if got := readMarker(t, cur); got != "old" {
		t.Errorf("app marker after rollback = %q, want old", got)
	}
	if _, err := os.Stat(cur + ".bak"); !os.IsNotExist(err) {
		t.Error(".bak should be gone after rollback")
	}
}

func TestSwapBundleReplacesStaleBak(t *testing.T) {
	dir := t.TempDir()
	cur := filepath.Join(dir, "mqtt-insight.app")
	next := filepath.Join(dir, "next.app")
	makeApp(t, cur, "old")
	makeApp(t, next, "new")
	makeApp(t, cur+".bak", "stale") // 이전 실행 잔재

	if err := swapBundle(next, cur); err != nil {
		t.Fatal(err)
	}
	if got := readMarker(t, cur+".bak"); got != "old" {
		t.Errorf("backup marker = %q, want old (stale replaced)", got)
	}
}

func TestCleanupBak(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "mqtt-insight.app")
	makeApp(t, app, "cur")
	makeApp(t, app+".bak", "old")

	CleanupBak(filepath.Join(app, "Contents/MacOS/mqtt-insight"))
	if _, err := os.Stat(app + ".bak"); !os.IsNotExist(err) {
		t.Error(".bak should be removed")
	}

	// 번들 밖 경로면 아무것도 안 한다 (패닉·삭제 없음)
	CleanupBak("/usr/local/bin/something")
}
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/update/ -run 'TestSwap|TestCleanup' -v`
Expected: FAIL (컴파일 에러 — 함수 미정의)

- [ ] **Step 3: 구현**

```go
package update

import (
	"fmt"
	"os"
)

// swapBundle replaces appPath with newApp: 기존 번들 → .bak rename 후 newApp을
// 제자리로 옮긴다. 같은 볼륨이어야 rename이 원자적이다(스테이징을 appPath
// 옆에 두는 이유). macOS는 실행 중 앱 디렉터리를 rename해도 프로세스가
// 유지된다. 실패 시 .bak을 원위치로 되돌린다.
func swapBundle(newApp, appPath string) error {
	bak := appPath + ".bak"
	_ = os.RemoveAll(bak) // 이전 실행이 남긴 잔재 제거
	if err := os.Rename(appPath, bak); err != nil {
		return fmt.Errorf("backup rename: %w", err)
	}
	if err := os.Rename(newApp, appPath); err != nil {
		if rbErr := os.Rename(bak, appPath); rbErr != nil {
			return fmt.Errorf("swap failed (%v) and rollback failed: %w", err, rbErr)
		}
		return fmt.Errorf("swap: %w", err)
	}
	return nil
}

// CleanupBak removes the ".app.bak" left by a previous update. 새 인스턴스의
// 시작 = 교체 성공이 확인된 시점이므로 startup에서 호출한다.
func CleanupBak(exe string) {
	if app, ok := BundlePath(exe); ok {
		_ = os.RemoveAll(app + ".bak")
	}
}
```

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/update/ -run 'TestSwap|TestCleanup' -v`
Expected: PASS (4개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add internal/update/swap.go internal/update/swap_test.go
git commit -m "feat(update): atomic bundle swap with rollback and .bak cleanup"
```

---

### Task 7: Apply 오케스트레이션 + Relaunch (`internal/update/apply.go`)

**Files:**
- Create: `internal/update/apply.go`
- Create: `internal/update/relaunch_darwin.go`
- Create: `internal/update/relaunch_other.go`
- Test: `internal/update/apply_test.go`

- [ ] **Step 1: 실패하는 테스트 작성**

다운로드→추출→swap 전체 흐름을 httptest zip 서버 + 가짜 번들로 검증한다. `makeApp`/`readMarker`는 Task 6에서 이미 정의됨(같은 패키지).

```go
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
}
```

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/update/ -run TestApply -v`
Expected: FAIL (컴파일 에러 — `Apply` 미정의)

- [ ] **Step 3: 구현 — `apply.go`**

```go
package update

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// Apply downloads the release asset, extracts it, and swaps it into appPath.
// progress는 다운로드 진행률(0–100)만 보고한다. 성공 후 호출자가
// Relaunch(appPath) → 종료 순으로 재시작을 마무리한다.
func Apply(ctx context.Context, assetURL, appPath string, progress func(int)) error {
	tmp, err := os.MkdirTemp("", "mqtt-insight-update-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)

	zipPath := filepath.Join(tmp, "update.zip")
	if err := download(ctx, assetURL, zipPath, progress); err != nil {
		return err
	}

	// 스테이징을 appPath와 같은 디렉터리에 만들어 swap의 rename이 볼륨을
	// 넘지 않게 한다 (cross-device rename은 EXDEV로 실패).
	staging, err := os.MkdirTemp(filepath.Dir(appPath), ".mqtt-insight-staging-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)

	if err := extractZip(zipPath, staging); err != nil {
		return err
	}
	newApp, err := findApp(staging)
	if err != nil {
		return err
	}
	return swapBundle(newApp, appPath)
}

// findApp locates the single top-level .app dir in the extracted archive.
func findApp(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	for _, e := range entries {
		if e.IsDir() && filepath.Ext(e.Name()) == ".app" {
			return filepath.Join(dir, e.Name()), nil
		}
	}
	return "", fmt.Errorf("no .app bundle in archive")
}
```

`relaunch_darwin.go`:

```go
//go:build darwin

package update

import "os/exec"

// Relaunch starts a fresh instance of the (already swapped) app bundle.
// `open -n`은 독립 프로세스를 띄우므로 호출 직후 자신을 종료해야 한다.
func Relaunch(appPath string) error {
	return exec.Command("open", "-n", appPath).Start()
}
```

`relaunch_other.go`:

```go
//go:build !darwin

package update

import "fmt"

// Relaunch is unsupported outside macOS — 폴백(릴리스 페이지)이 대신한다.
func Relaunch(appPath string) error {
	return fmt.Errorf("self-update relaunch not supported on this platform")
}
```

- [ ] **Step 4: 통과 확인 + 패키지 전체 확인**

Run: `go test ./internal/update/ -v && go vet ./internal/update/`
Expected: 전부 PASS, vet 무경고

- [ ] **Step 5: 커밋**

```bash
git add internal/update/apply.go internal/update/apply_test.go internal/update/relaunch_darwin.go internal/update/relaunch_other.go
git commit -m "feat(update): orchestrate download-extract-swap and relaunch"
```

---

### Task 8: 설정 필드 `CheckUpdates` (`internal/config/config.go`)

**Files:**
- Modify: `internal/config/config.go` (Settings 구조체 + defaults)
- Test: `internal/config/config_test.go`

- [ ] **Step 1: 실패하는 테스트 작성** — `internal/config/config_test.go`에 추가

```go
func TestCheckUpdatesDefaultsTrueForLegacyFile(t *testing.T) {
	// 기존 사용자의 설정 파일에는 checkUpdates 필드가 없다 → true 유지
	path := filepath.Join(t.TempDir(), "config.json")
	legacy := `{"settings":{"theme":"light","ringBufferSize":100},"profiles":[]}`
	if err := os.WriteFile(path, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Settings.CheckUpdates {
		t.Error("CheckUpdates should default to true for legacy config")
	}
	if cfg.Settings.Theme != "light" {
		t.Errorf("Theme = %q, want light (merge preserved)", cfg.Settings.Theme)
	}
}

func TestCheckUpdatesExplicitFalse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	body := `{"settings":{"checkUpdates":false},"profiles":[]}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Settings.CheckUpdates {
		t.Error("CheckUpdates should honor explicit false")
	}
}
```

(파일 상단 import에 `os`, `path/filepath`가 이미 있는지 확인하고 없으면 추가.)

- [ ] **Step 2: 실패 확인**

Run: `go test ./internal/config/ -run TestCheckUpdates -v`
Expected: FAIL (컴파일 에러 — `CheckUpdates` 필드 미정의)

- [ ] **Step 3: 구현** — `config.go` 수정 2곳

Settings 구조체 (`RecToastShown` 아래에 추가):

```go
	RecToastShown     bool   `json:"recToastShown"`
	CheckUpdates      bool   `json:"checkUpdates"`      // 시작 시 새 버전 확인
```

defaults() 수정:

```go
func defaults() *Config {
	return &Config{Settings: Settings{
		Theme: "dark", RingBufferSize: 200, DefaultFormat: "plain",
		Lang: "ko", TimestampFormat: "absolute", MessageOrder: "newest",
		CheckUpdates: true,
	}}
}
```

(`Load`는 `defaults()` 위에 unmarshal로 merge하므로 필드가 없는 기존 파일은 자동으로 true가 된다 — 별도 마이그레이션 코드 불필요.)

- [ ] **Step 4: 통과 확인**

Run: `go test ./internal/config/ -v`
Expected: 전부 PASS (기존 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add internal/config/config.go internal/config/config_test.go
git commit -m "feat(config): add checkUpdates setting (default on)"
```

---

### Task 9: 백엔드 와이어링 (`app.go`) + 바인딩 재생성

**Files:**
- Modify: `app.go`
- Regenerate: `frontend/wailsjs/` (wails CLI)

앱 시작 시 `.bak` 정리 + 체크 goroutine, 그리고 `GetUpdateInfo`/`ApplyUpdate` 바인딩을 추가한다. 이벤트가 프론트 리스너 등록 전에 발사될 수 있으므로 **이벤트(push) + GetUpdateInfo(pull) 병용**으로 레이스를 없앤다.

- [ ] **Step 1: `app.go` 수정 — import**

기존 import 블록에 추가 (wails의 `runtime`과 충돌하므로 표준 runtime은 alias):

```go
import (
	"context"
	"os"
	"path/filepath"
	goruntime "runtime"
	"sync"
	"time"

	"github.com/kenshin579/mqtt-insight/internal/app"
	"github.com/kenshin579/mqtt-insight/internal/config"
	"github.com/kenshin579/mqtt-insight/internal/mqtt"
	"github.com/kenshin579/mqtt-insight/internal/store"
	"github.com/kenshin579/mqtt-insight/internal/update"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)
```

- [ ] **Step 2: App 구조체에 필드 추가**

```go
type App struct {
	ctx        context.Context
	cfg        *config.Config
	cfgPath    string
	mu         sync.Mutex
	client     mqtt.MQTTClient
	store      store.MessageStore
	batcher    *app.Batcher
	recorder   *store.SQLiteRecorder
	connCancel context.CancelFunc
	connState  string // last emitted status state (protected by mu)
	updateInfo *update.Info // startup 체크 결과, nil = 최신 (protected by mu)
	updating   bool         // ApplyUpdate 진행 중 가드 (protected by mu)
}
```

- [ ] **Step 3: startup 끝에 추가**

`a.batcher.Start()` 다음 줄에:

```go
	if exe, err := os.Executable(); err == nil {
		update.CleanupBak(exe)
	}
	if version != "dev" && a.cfg.Settings.CheckUpdates {
		go a.checkForUpdate()
	}
```

- [ ] **Step 4: 파일 끝(GetVersion 아래)에 업데이트 메서드 추가**

```go
// --- In-app update (spec: docs/superpowers/specs/2026-07-05-in-app-update-design.md) ---

// checkForUpdate queries GitHub once and stores/broadcasts the result.
// 실패는 조용히 무시한다(다음 실행에서 재시도되는 셈).
func (a *App) checkForUpdate() {
	ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
	defer cancel()
	info, err := update.Check(ctx, update.DefaultAPIURL, version, goruntime.GOOS)
	if err != nil || info == nil {
		return
	}
	_, ok := selfUpdatePath()
	info.CanSelfUpdate = ok && info.AssetURL != ""
	a.mu.Lock()
	a.updateInfo = info
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "update:available", info)
}

// selfUpdatePath returns the .app bundle path when self-update is possible:
// macOS + .app 번들 안 + translocation 아님.
func selfUpdatePath() (string, bool) {
	if goruntime.GOOS != "darwin" {
		return "", false
	}
	exe, err := os.Executable()
	if err != nil {
		return "", false
	}
	if update.IsTranslocated(exe) {
		return "", false
	}
	return update.BundlePath(exe)
}

// GetUpdateInfo returns the update found by the startup check (nil = none yet).
// 프론트가 mount 시 pull해 update:available 이벤트와의 레이스를 없앤다.
func (a *App) GetUpdateInfo() *update.Info {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.updateInfo
}

// ApplyUpdate downloads and installs the pending update, then restarts the
// app. 진행률은 update:progress(0–100), 실패는 update:error 이벤트로 알린다.
func (a *App) ApplyUpdate() {
	a.mu.Lock()
	info := a.updateInfo
	if info == nil || !info.CanSelfUpdate || a.updating {
		a.mu.Unlock()
		return
	}
	a.updating = true
	a.mu.Unlock()

	go func() {
		defer func() {
			a.mu.Lock()
			a.updating = false
			a.mu.Unlock()
		}()
		appPath, ok := selfUpdatePath()
		if !ok {
			runtime.EventsEmit(a.ctx, "update:error", "cannot self-update from this install location")
			return
		}
		err := update.Apply(a.ctx, info.AssetURL, appPath, func(pct int) {
			runtime.EventsEmit(a.ctx, "update:progress", pct)
		})
		if err != nil {
			runtime.EventsEmit(a.ctx, "update:error", err.Error())
			return
		}
		if err := update.Relaunch(appPath); err != nil {
			runtime.EventsEmit(a.ctx, "update:error", err.Error())
			return
		}
		runtime.Quit(a.ctx)
	}()
}
```

- [ ] **Step 5: 컴파일·vet 확인**

Run: `go build ./... && go vet ./...`
Expected: 무경고 성공

- [ ] **Step 6: wailsjs 바인딩 재생성**

Run: `wails generate module`
Expected: `frontend/wailsjs/go/main/App.d.ts`에 `GetUpdateInfo`, `ApplyUpdate` 등장, `frontend/wailsjs/go/models.ts`에 `update.Info` 클래스 생성.

확인: `grep -n "ApplyUpdate\|GetUpdateInfo" frontend/wailsjs/go/main/App.d.ts`

(`wails` CLI가 없으면 `go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0`)

- [ ] **Step 7: 커밋**

```bash
git add app.go frontend/wailsjs
git commit -m "feat: wire update check and apply into app bindings"
```

---

### Task 10: 프론트 상태·이벤트·i18n

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/store/appStore.ts`
- Modify: `frontend/src/bridge/events.ts`
- Modify: `frontend/src/lib/i18n.ts`

- [ ] **Step 1: `types.ts`에 UpdateInfo 추가** (파일 끝)

```ts
/** Go update.Info 미러 — update:available 이벤트/GetUpdateInfo 페이로드 */
export interface UpdateInfo {
  version: string;
  releaseURL: string;
  assetURL: string;
  canSelfUpdate: boolean;
}
```

- [ ] **Step 2: `appStore.ts` — SettingsState·상태·액션 추가**

`SettingsState`에 필드 추가:

```ts
export interface SettingsState {
  lang: Lang; theme: "dark" | "light" | "system";
  defaultFormat: Fmt; timestampFormat: "absolute" | "relative";
  messageOrder: "newest" | "oldest"; ringBufferSize: number;
  checkUpdates: boolean;
}
```

import에 `UpdateInfo` 추가:

```ts
import type { Message, TreeNode, Status, UpdateInfo } from "../types";
```

`AppState` 인터페이스의 `settings: SettingsState;` 아래에:

```ts
  // update
  updateInfo: UpdateInfo | null;
  updateProgress: number | null; // null = 진행 중 아님
  updateError: string | null;
```

액션 선언(`setSettings` 아래):

```ts
  setUpdateInfo: (i: UpdateInfo | null) => void;
  setUpdateProgress: (p: number | null) => void;
  setUpdateError: (e: string | null) => void;
```

초기값 — `settings:` 줄을 다음으로 교체하고 update 상태 추가:

```ts
  settings: { lang: "ko", theme: "dark", defaultFormat: "plain", timestampFormat: "absolute", messageOrder: "newest", ringBufferSize: 200, checkUpdates: true },
  updateInfo: null, updateProgress: null, updateError: null,
```

액션 구현(`setSettings` 구현 아래):

```ts
  setUpdateInfo: (i) => set({ updateInfo: i }),
  setUpdateProgress: (p) => set({ updateProgress: p }),
  setUpdateError: (e) => set({ updateError: e }),
```

- [ ] **Step 3: `bridge/events.ts` — 이벤트 3종 연결** (파일 전체 교체)

```ts
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/appStore";
import type { Message, TreeNode, StatusEvent, UpdateInfo } from "../types";

/** Wire Wails backend events into the store. Call once on mount; returns cleanup. */
export function initEventBridge(): () => void {
  EventsOn("mqtt:messages", (ms: Message[]) => useAppStore.getState().pushMessages(ms));
  EventsOn("mqtt:tree", (t: TreeNode) => useAppStore.getState().setTree(t));
  EventsOn("mqtt:status", (e: StatusEvent) => {
    const st = useAppStore.getState();
    st.setStatus(e.state, e.attempt);
    // reason은 연결 시도 실패 컨텍스트에서만 배너로 씀 — Connect 호출부가 처리.
  });
  EventsOn("update:available", (i: UpdateInfo) => useAppStore.getState().setUpdateInfo(i));
  EventsOn("update:progress", (p: number) => useAppStore.getState().setUpdateProgress(p));
  EventsOn("update:error", (msg: string) => {
    const st = useAppStore.getState();
    st.setUpdateProgress(null);
    st.setUpdateError(msg);
  });
  return () =>
    EventsOff("mqtt:messages", "mqtt:tree", "mqtt:status", "update:available", "update:progress", "update:error");
}
```

- [ ] **Step 4: `lib/i18n.ts` — 키 추가**

`ko`의 `chartMaxKeys` 줄 아래에:

```ts
    setCheckUpdates: '시작 시 업데이트 확인',
    updAvailable: '새 버전 {v} 사용 가능',
    updRestart: '업데이트 후 재시작',
    updOpenRelease: '릴리스 페이지 열기',
    updDownloading: '다운로드 중… {pct}%',
    updError: '업데이트 실패: {msg}',
```

`en`의 `chartMaxKeys` 줄 아래에:

```ts
    setCheckUpdates: 'Check for updates at startup',
    updAvailable: 'New version {v} available',
    updRestart: 'Update & restart',
    updOpenRelease: 'Open release page',
    updDownloading: 'Downloading… {pct}%',
    updError: 'Update failed: {msg}',
```

- [ ] **Step 5: 프론트 게이트 확인**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS (i18n 키 패리티 테스트가 있으면 ko/en 동시 추가로 통과)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/types.ts frontend/src/store/appStore.ts frontend/src/bridge/events.ts frontend/src/lib/i18n.ts
git commit -m "feat(frontend): update state, event bridge, and i18n strings"
```

---

### Task 11: ⚙ 배지 + mount 시 pull (`App.tsx`, `App.css`)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: `App.tsx` — import·selector·pull 추가**

import 줄 수정 (wails 바인딩에 `GetUpdateInfo` 추가):

```ts
import { Connect, GetProfiles, GetSettings, RecordedTopics, GetUpdateInfo } from "../wailsjs/go/main/App";
```

컴포넌트 상단 selector 추가 (`const status = ...` 근처):

```ts
  const updateInfo = useAppStore((s) => s.updateInfo);
  const setUpdateInfo = useAppStore((s) => s.setUpdateInfo);
```

mount useEffect 안(`GetSettings().then(...)` 다음)에 pull 추가 — 이벤트가 리스너 등록 전에 발사된 경우를 커버:

```ts
    GetUpdateInfo().then((i) => { if (i) setUpdateInfo(i as import("./types").UpdateInfo); });
```

- [ ] **Step 2: ⚙ 버튼에 배지 렌더**

titlebar의 gear 버튼을 다음으로 교체:

```tsx
        <button className="tb-btn gear" title={t("setTitle")} onClick={() => setShowSettings(true)}>
          ⚙{updateInfo && <i className="upd-dot" />}
        </button>
```

- [ ] **Step 3: `App.css` — 배지 스타일**

`.tb-btn.gear { font-size: 14px; }` 줄을 다음으로 교체:

```css
.tb-btn.gear { font-size: 14px; position: relative; }
.upd-dot { position: absolute; top: 1px; right: 1px; width: 7px; height: 7px; border-radius: 50%;
  background: var(--err); pointer-events: none; }
```

(`--err` 변수가 `frontend/src/lib/tokens.css`에 없으면 `grep -n "err" frontend/src/lib/tokens.css`로 실제 상태 색 변수명을 확인해 그걸 쓴다.)

- [ ] **Step 4: 게이트 확인**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/App.tsx frontend/src/App.css
git commit -m "feat(frontend): gear badge and startup update pull"
```

---

### Task 12: 설정 모달 — 업데이트 행 + 토글 (`SettingsModal.tsx`)

**Files:**
- Modify: `frontend/src/components/SettingsModal.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: import·selector 추가**

```ts
import { SaveSettings, GetVersion, ApplyUpdate } from "../../wailsjs/go/main/App";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
```

컴포넌트 상단(`const [version, setVersion]` 근처)에:

```ts
  const updateInfo = useAppStore((s) => s.updateInfo);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const updateError = useAppStore((s) => s.updateError);
```

- [ ] **Step 2: `patch()`의 createFrom에 checkUpdates 전달**

```ts
    const full = config.Settings.createFrom({
      theme: merged.theme,
      ringBufferSize: merged.ringBufferSize,
      defaultFormat: merged.defaultFormat,
      lang: merged.lang,
      timestampFormat: merged.timestampFormat,
      messageOrder: merged.messageOrder,
      checkUpdates: merged.checkUpdates,
      treeHintDismissed,
      recToastShown,
    });
```

- [ ] **Step 3: 토글 UI — `secGeneral` 섹션 끝(테마 필드 다음)에 추가**

```tsx
          <div className="setting-field tight">
            <label className="row-check">
              <input
                type="checkbox"
                checked={settings.checkUpdates}
                onChange={(e) => patch({ checkUpdates: e.target.checked })}
              />{" "}
              {t("setCheckUpdates")}
            </label>
          </div>
```

- [ ] **Step 4: 푸터 위 업데이트 행 — `settings-footer` div 바로 앞에 추가**

```tsx
        {updateInfo && (
          <div className="settings-update">
            <span className="settings-update-label">{t("updAvailable", { v: updateInfo.version })}</span>
            {updateProgress !== null ? (
              <button className="btn-accent" disabled>
                {t("updDownloading", { pct: updateProgress })}
              </button>
            ) : updateInfo.canSelfUpdate ? (
              <button className="btn-accent" onClick={() => ApplyUpdate()}>{t("updRestart")}</button>
            ) : (
              <button className="btn-accent" onClick={() => BrowserOpenURL(updateInfo.releaseURL)}>
                {t("updOpenRelease")}
              </button>
            )}
            {updateError && (
              <div className="settings-update-error">
                {t("updError", { msg: updateError })}{" "}
                <a onClick={() => BrowserOpenURL(updateInfo.releaseURL)}>{t("updOpenRelease")}</a>
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 5: `App.css`에 업데이트 행 스타일 추가** (설정 모달 관련 CSS 근처, `.settings-footer` 정의 옆)

```css
.settings-update { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 20px; border-top: 1px solid var(--line); }
.settings-update-label { color: var(--dim); font-size: 12px; flex: 1; }
.settings-update-error { flex-basis: 100%; color: var(--err); font-size: 11px; }
.settings-update-error a { text-decoration: underline; cursor: pointer; }
```

(패딩·색은 주변 `.settings-footer` 규칙과 맞춘다 — 실제 값이 다르면 그쪽을 따른다. `--line`/`--dim`/`--err`가 tokens.css에 없으면 실제 변수명으로 대체.)

- [ ] **Step 6: 게이트 확인**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/components/SettingsModal.tsx frontend/src/App.css
git commit -m "feat(frontend): settings update row and check-updates toggle"
```

---

### Task 13: 문서 갱신 + 전체 게이트

**Files:**
- Modify: `docs/superpowers/specs/2026-07-05-in-app-update-design.md` (§3 감지 — push+pull 병용 반영)
- Modify: `docs/MANUAL_TESTING.md` (체크리스트 추가)

- [ ] **Step 1: 스펙 §3 "감지" 절 보정**

`update:available` emit 설명 문단 끝에 한 문장 추가:

```markdown
  이벤트가 프론트 리스너 등록 전에 발사되는 레이스를 막기 위해 프론트는 mount 시 `GetUpdateInfo()`로 한 번 pull한다(push+pull 병용).
```

- [ ] **Step 2: `docs/MANUAL_TESTING.md`에 섹션 추가** (기존 시나리오 섹션들 뒤, "머지/릴리스 전" 게이트 앞)

```markdown
## 인앱 업데이트

구버전 빌드로 실제 릴리스 대상 업데이트를 확인한다:

```bash
wails build -clean -ldflags "-X main.version=v0.0.1"
xattr -cr build/bin/mqtt-insight.app && open build/bin/mqtt-insight.app
```

- [ ] 시작 후 ⚙ 아이콘에 빨간 점 배지가 나타난다 (GitHub 최신 릴리스 감지)
- [ ] 설정 모달 하단에 "새 버전 vX.Y.Z 사용 가능" + [업데이트 후 재시작] 버튼
- [ ] 버튼 클릭 → 진행률 % 표시 → 앱이 자동 재시작되고 설정 푸터 버전이 최신 태그
- [ ] 재시작 후 앱 폴더 옆 `.app.bak`이 삭제되어 있다 (한 번 더 재시작 후 확인)
- [ ] 설정 "시작 시 업데이트 확인" 끄고 재시작 → 배지 없음
- [ ] `wails dev`(dev 버전) → 체크 스킵, 배지 없음
- [ ] translocation 폴백: `xattr -cr` 없이 Downloads에서 우클릭-열기로 실행 → 버튼이 [릴리스 페이지 열기]
- [ ] (Windows) 배지는 뜨고 버튼이 [릴리스 페이지 열기]로 동작
- [ ] 네트워크 차단 상태로 시작 → 에러 없이 조용히 무시 (배지 없음)
```

- [ ] **Step 3: 인코딩 확인**

Run: `file -I docs/MANUAL_TESTING.md docs/superpowers/specs/2026-07-05-in-app-update-design.md`
Expected: 둘 다 `charset=utf-8`

- [ ] **Step 4: 전체 게이트**

Run: `make test`
Expected: go vet/test + vitest + tsc 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add docs/MANUAL_TESTING.md docs/superpowers/specs/2026-07-05-in-app-update-design.md
git commit -m "docs: manual test checklist for in-app update"
```

---

## 완료 후

1. `docs/MANUAL_TESTING.md`의 새 "인앱 업데이트" 섹션 중 로컬에서 가능한 항목 스모크 (실제 교체 E2E는 릴리스가 있어야 완전 검증 — 최소한 배지·폴백·dev 스킵은 확인)
2. superpowers:requesting-code-review로 리뷰
3. superpowers:finishing-a-development-branch — PR 생성 (`gh pr create` + HEREDOC, 리뷰어 지정 금지)
