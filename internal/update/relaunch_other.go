//go:build !darwin

package update

import "fmt"

// Relaunch is unsupported outside macOS — 폴백(릴리스 페이지)이 대신한다.
func Relaunch(appPath string) error {
	return fmt.Errorf("self-update relaunch not supported on this platform")
}
