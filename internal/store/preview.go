package store

import (
	"encoding/hex"
	"strings"
	"unicode/utf8"
)

const (
	// previewRunes caps the text preview shown per tree node. The frontend used
	// to decode the full payload just to slice 34 chars off it; the backend now
	// sends only what is displayable. 48 is comfortably wider than that old
	// 34-char slice so a tree row still reads as a full label, while staying
	// far short of shipping a whole ~1KB payload per node.
	previewRunes = 48
	// previewHexBytes caps the hex rendering of binary payloads. 16 bytes (32
	// hex chars) keeps a binary preview about the same on-screen width as a
	// 48-rune text preview.
	previewHexBytes = 16
)

// previewOf renders a short, display-safe summary of a payload for the topic tree.
// Binary payloads render as hex; text payloads are truncated on a rune boundary so
// the frontend never receives a split code point, and malformed bytes are replaced
// with U+FFFD rather than cutting the preview short.
//
// Replacement happens one byte at a time, so a truncated multi-byte rune yields two
// U+FFFD here where a browser's TextDecoder (WHATWG maximal-subpart rule) would emit
// one. A preview label only needs to signal "this payload has malformed bytes", so
// the glyph count is not worth matching.
func previewOf(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}
	if isBinary(payload) {
		n := len(payload)
		if n > previewHexBytes {
			n = previewHexBytes
		}
		return hex.EncodeToString(payload[:n])
	}
	var b strings.Builder
	b.Grow(previewRunes * utf8.UTFMax)
	for i, count := 0, 0; i < len(payload) && count < previewRunes; count++ {
		r, size := utf8.DecodeRune(payload[i:])
		if r == utf8.RuneError && size == 1 {
			// A single malformed byte — not only a truncated tail, this fires
			// on an invalid byte anywhere in the payload (e.g. Latin-1 /
			// Windows-1252 bytes from an embedded device). Replace it with
			// U+FFFD and advance one byte, mirroring the frontend's
			// TextDecoder (payload.ts bytesToString), which also
			// replaces-and-continues rather than stopping. This keeps the
			// tree preview and the message detail view in agreement.
			b.WriteRune(utf8.RuneError)
			i++
			continue
		}
		b.WriteRune(r)
		i += size
	}
	return b.String()
}

// isBinary mirrors the frontend's detectFormat heuristic (payload.ts:27-31): any
// byte below 9 or between 14 and 31 means the payload is not displayable text.
func isBinary(payload []byte) bool {
	for _, c := range payload {
		if c < 9 || (c > 13 && c < 32) {
			return true
		}
	}
	return false
}
