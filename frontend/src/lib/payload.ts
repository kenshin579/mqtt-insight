export type Format = "plain" | "json" | "hex" | "base64";

/** Decode a base64 string (Go []byte JSON encoding) to a byte array. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64 || "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/** Decode base64 payload to a UTF-8 string. */
export function bytesToString(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

/** Auto-detect the best display format from a base64 payload. */
export function detectFormat(b64: string): Format {
  const s = bytesToString(b64).trim();
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      JSON.parse(s);
      return "json";
    } catch {
      /* fall through */
    }
  }
  const bytes = base64ToBytes(b64);
  for (const byte of bytes) {
    if (byte < 9 || (byte > 13 && byte < 32)) return "hex";
  }
  return "plain";
}

/** Format a base64 payload for display in the chosen format. */
export function formatPayload(b64: string, fmt: Format): string {
  switch (fmt) {
    case "json":
      try {
        return JSON.stringify(JSON.parse(bytesToString(b64)), null, 2);
      } catch {
        return bytesToString(b64);
      }
    case "hex":
      return Array.from(base64ToBytes(b64))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
    case "base64":
      return b64;
    case "plain":
    default:
      return bytesToString(b64);
  }
}
