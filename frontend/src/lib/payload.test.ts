import { describe, it, expect } from "vitest";
import { detectFormat, formatPayload } from "./payload";

// Go sends []byte as base64; these helpers feed base64 in.
function b64(s: string): string {
  return btoa(s);
}

describe("payload", () => {
  it("detects JSON", () => {
    expect(detectFormat(b64('{"a":1}'))).toBe("json");
  });
  it("detects plain text", () => {
    expect(detectFormat(b64("hello"))).toBe("plain");
  });
  it("pretty-prints JSON", () => {
    const out = formatPayload(b64('{"a":1}'), "json");
    expect(out).toContain('"a": 1');
  });
  it("renders hex uppercase space-separated", () => {
    const out = formatPayload(b64("AB"), "hex");
    expect(out).toBe("41 42");
  });
  it("plain decodes base64 back to text", () => {
    expect(formatPayload(b64("hello"), "plain")).toBe("hello");
  });
});
