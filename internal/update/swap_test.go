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
