package store

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestPreviewOfPassesShortText(t *testing.T) {
	if got := previewOf([]byte(`{"a":1}`)); got != `{"a":1}` {
		t.Fatalf(`want {"a":1}, got %q`, got)
	}
}

func TestPreviewOfTruncatesAtRuneBoundary(t *testing.T) {
	// 50 Korean runes, 3 bytes each — must cut at 48 runes, never mid-rune.
	got := previewOf([]byte(strings.Repeat("가", 50)))
	if n := utf8.RuneCountInString(got); n != previewRunes {
		t.Fatalf("want %d runes, got %d (%q)", previewRunes, n, got)
	}
	if !utf8.ValidString(got) {
		t.Fatalf("preview must stay valid UTF-8, got %q", got)
	}
}

func TestPreviewOfRendersBinaryAsHex(t *testing.T) {
	if got := previewOf([]byte{0x00, 0x01, 0xff}); got != "0001ff" {
		t.Fatalf("want 0001ff, got %q", got)
	}
}

func TestPreviewOfCapsHexLength(t *testing.T) {
	got := previewOf(make([]byte, 64)) // all NUL -> binary
	if len(got) != previewHexBytes*2 {
		t.Fatalf("want %d hex chars, got %d", previewHexBytes*2, len(got))
	}
}

func TestPreviewOfKeepsNewlinesAsText(t *testing.T) {
	// \n (0x0a) and \r (0x0d) are inside the allowed 9..13 range: still text.
	if got := previewOf([]byte("a\nb")); got != "a\nb" {
		t.Fatalf("want a\\nb, got %q", got)
	}
}

func TestPreviewOfEmpty(t *testing.T) {
	if got := previewOf(nil); got != "" {
		t.Fatalf("want empty string, got %q", got)
	}
}
