//go:build darwin

package update

import "os/exec"

// Relaunch starts a fresh instance of the (already swapped) app bundle.
// `open -n`은 독립 프로세스를 띄우므로 호출 직후 자신을 종료해야 한다.
func Relaunch(appPath string) error {
	return exec.Command("open", "-n", appPath).Start()
}
