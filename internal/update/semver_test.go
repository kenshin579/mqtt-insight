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
