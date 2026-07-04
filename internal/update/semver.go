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
