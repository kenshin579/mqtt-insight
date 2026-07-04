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
