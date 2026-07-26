package store

import (
	"bytes"
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

func TestPreviewOfExactRuneBoundaryNotTruncated(t *testing.T) {
	in := strings.Repeat("가", previewRunes)
	if got := previewOf([]byte(in)); got != in {
		t.Fatalf("want %q, got %q", in, got)
	}
}

func TestPreviewOfExactHexBoundaryNotTruncated(t *testing.T) {
	got := previewOf(bytes.Repeat([]byte{0x01}, previewHexBytes))
	want := strings.Repeat("01", previewHexBytes)
	if got != want {
		t.Fatalf("want %q, got %q", want, got)
	}
}

func TestPreviewOfKeepsEncodedReplacementChar(t *testing.T) {
	// A validly encoded U+FFFD (3 bytes) must not be mistaken for a decode
	// error (which utf8.DecodeRune reports as size == 1). Built via
	// utf8.RuneError rather than a pasted replacement-character glyph or
	// escape so the expectation stays unambiguous.
	in := string(utf8.RuneError) + "x"
	if got := previewOf([]byte(in)); got != in {
		t.Fatalf("want %q, got %q", in, got)
	}
}

func TestPreviewOfReplacesInvalidBytesAndContinues(t *testing.T) {
	// 0xE9 (Latin-1 'é') is not a control byte, so isBinary says "text", but
	// it is not valid UTF-8 on its own. It must be replaced with U+FFFD, and
	// the readable ASCII after it must survive rather than being dropped.
	got := previewOf([]byte{0xE9, 'a', 'b', 'c'})
	want := string(utf8.RuneError) + "abc"
	if got != want {
		t.Fatalf("want %q, got %q", want, got)
	}
}

func TestPreviewOfHandlesTruncatedTrailingRune(t *testing.T) {
	// "가" is 3 bytes; keeping only the first 2 leaves an incomplete lead
	// sequence. utf8.DecodeRune reports (RuneError, 1) for an incomplete
	// sequence at the end of the slice (n < sz) -- not the byte count of the
	// intended rune -- so the first invalid byte consumes 1 byte and yields
	// one U+FFFD, then the single leftover continuation byte is itself an
	// invalid lead byte and yields a second U+FFFD. Replace-and-continue by
	// single bytes therefore emits two replacement characters here, not one.
	payload := append([]byte("ab"), []byte("가")[:2]...)
	got := previewOf(payload)
	want := "ab" + string(utf8.RuneError) + string(utf8.RuneError)
	if got != want {
		t.Fatalf("want %q, got %q", want, got)
	}
}
