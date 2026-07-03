import { describe, it, expect } from "vitest";
import { diffJson } from "./diff";

describe("diffJson", () => {
  it("classifies changed/added/removed/unchanged", () => {
    const r = diffJson({ a: 1, b: "x", c: true }, { a: 2, b: "x", d: 5 });
    expect(r).toEqual([
      { key: "a", kind: "changed", value: "2", prev: "1" },
      { key: "b", kind: "unchanged", value: '"x"' },
      { key: "c", kind: "removed", value: "true" },
      { key: "d", kind: "added", value: "5" },
    ]);
  });
  it("returns null for non-objects/arrays", () => {
    expect(diffJson([1], { a: 1 })).toBeNull();
    expect(diffJson(null, { a: 1 })).toBeNull();
    expect(diffJson({ a: 1 }, "s" as unknown as object)).toBeNull();
  });
});
