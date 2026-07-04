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
