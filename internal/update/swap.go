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
