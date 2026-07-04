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
