import { describe, it, expect } from "vitest";
import { formatTime, relativeTime } from "./time";

describe("time", () => {
  it("absolute HH:MM:SS", () => {
    const d = new Date("2026-07-03T09:05:07");
    expect(formatTime(d.toISOString(), "absolute", "ko")).toMatch(/09:05:07/);
  });
  it("relative ko/en", () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 3000).toISOString(), "ko", now)).toBe("3초 전");
    expect(relativeTime(new Date(now - 120000).toISOString(), "en", now)).toBe("2m ago");
    expect(relativeTime(new Date(now - 7200000).toISOString(), "ko", now)).toBe("2시간 전");
  });
});
