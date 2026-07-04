import { describe, it, expect } from "vitest";
import { topicMatches, matchesAny } from "./mqttMatch";

describe("mqttMatch", () => {
  it("exact", () => expect(topicMatches("a/b", "a/b")).toBe(true));
  it("# matches everything incl multi-level", () => {
    expect(topicMatches("a", "#")).toBe(true);
    expect(topicMatches("a/b/c", "#")).toBe(true);
  });
  it("trailing # matches subtree incl parent", () => {
    expect(topicMatches("a/b/c", "a/#")).toBe(true);
    expect(topicMatches("a", "a/#")).toBe(true);
    expect(topicMatches("b/x", "a/#")).toBe(false);
  });
  it("+ matches exactly one level", () => {
    expect(topicMatches("home/kitchen/temp", "home/+/temp")).toBe(true);
    expect(topicMatches("home/a/b/temp", "home/+/temp")).toBe(false);
  });
  it("+ does not match missing or extra levels", () => {
    expect(topicMatches("a", "a/+")).toBe(false);
    expect(topicMatches("a/", "a/+")).toBe(true); // trailing empty segment is a level
    expect(topicMatches("a/b", "+")).toBe(false);
  });
  it("matchesAny over sub list", () => {
    expect(matchesAny("s/1/t", [{ pattern: "x/#", qos: 0 }, { pattern: "s/+/t", qos: 1 }])).toBe(true);
    expect(matchesAny("s/1/t", [])).toBe(false);
  });
});
