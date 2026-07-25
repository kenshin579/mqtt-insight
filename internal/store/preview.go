package store

import (
	"encoding/hex"
	"strings"
	"unicode/utf8"
)

const (
	// previewRunes caps the text preview shown per tree node. The frontend used
	// to decode the full payload just to slice 34 chars off it; the backend now
	// sends only what is displayable.
	previewRunes = 48
	// previewHexBytes caps the hex rendering of binary payloads.
	previewHexBytes = 16
)

// previewOf renders a short, display-safe summary of a payload for the topic tree.
// Binary payloads render as hex; text payloads are truncated on a rune boundary so
// the frontend never receives a split code point.
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
	for i, count := 0, 0; i < len(payload) && count < previewRunes; count++ {
		r, size := utf8.DecodeRune(payload[i:])
		if r == utf8.RuneError && size == 1 {
			break // invalid UTF-8 tail: stop at the last whole rune
		}
		b.WriteRune(r)
		i += size
	}
	return b.String()
}

// isBinary mirrors the frontend's detectFormat heuristic (payload.ts:28-30): any
// byte below 9 or between 14 and 31 means the payload is not displayable text.
func isBinary(payload []byte) bool {
	for _, c := range payload {
		if c < 9 || (c > 13 && c < 32) {
			return true
		}
	}
	return false
}
