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

func TestExtractZipRejectsEscapingSymlink(t *testing.T) {
	cases := []struct{ name, target string }{
		{"abs", "/etc"},
		{"rel", "../../outside"},
	}
	for _, c := range cases {
		dir := t.TempDir()
		zipPath := filepath.Join(dir, c.name+".zip")
		f, err := os.Create(zipPath)
		if err != nil {
			t.Fatal(err)
		}
		w := zip.NewWriter(f)
		sh := &zip.FileHeader{Name: "Demo.app/badlink"}
		sh.SetMode(os.ModeSymlink | 0o777)
		sw, err := w.CreateHeader(sh)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = sw.Write([]byte(c.target))
		_ = w.Close()
		_ = f.Close()

		if err := extractZip(zipPath, filepath.Join(dir, "out")); err == nil {
			t.Errorf("%s: expected error for symlink target %q", c.name, c.target)
		}
	}
}
