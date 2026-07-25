import { describe, it, expect } from "vitest";
import { leafCount, findNode, topTopics, STREAM_LEAF_THRESHOLD } from "./subtree";
import type { TreeNode } from "../types";

function leaf(fullTopic: string, count: number, preview = ""): TreeNode {
  const name = fullTopic.split("/").pop() as string;
  return { name, fullTopic, messageCount: count, preview, lastSeen: "", retained: false };
}
function branch(fullTopic: string, children: TreeNode[]): TreeNode {
  const name = fullTopic.split("/").pop() as string;
  return { name, fullTopic, children, messageCount: 0, lastSeen: "", retained: false };
}

const tree: TreeNode = branch("", [
  branch("arc", [
    branch("arc/robot", [
      branch("arc/robot/r1", [leaf("arc/robot/r1/report", 5), leaf("arc/robot/r1/bb", 3)]),
      branch("arc/robot/r2", [leaf("arc/robot/r2/report", 9, '{"v":1}')]),
    ]),
  ]),
]);

describe("subtree", () => {
  it("counts a leaf as one", () => {
    expect(leafCount(leaf("a/b", 1))).toBe(1);
  });
  it("counts leaves below a branch", () => {
    expect(leafCount(tree)).toBe(3);
    expect(leafCount(findNode(tree, "arc/robot/r1") as TreeNode)).toBe(2);
  });
  it("finds a node by full topic", () => {
    expect(findNode(tree, "arc/robot/r2/report")?.messageCount).toBe(9);
    expect(findNode(tree, "nope")).toBeNull();
    expect(findNode(null, "arc")).toBeNull();
  });
  it("ranks leaves by message count and applies the limit", () => {
    // Asserting whole rows, not just topics: count and the preview fallback
    // would otherwise be free to drift without failing anything.
    expect(topTopics(findNode(tree, "arc") as TreeNode, 2)).toEqual([
      { topic: "arc/robot/r2/report", count: 9, preview: '{"v":1}' },
      { topic: "arc/robot/r1/report", count: 5, preview: "" },
    ]);
  });
  it("clamps a non-positive limit to an empty list", () => {
    // slice(0, -1) would otherwise return nearly the whole list.
    const arc = findNode(tree, "arc") as TreeNode;
    expect(topTopics(arc, 0)).toEqual([]);
    expect(topTopics(arc, -1)).toEqual([]);
  });
  it("exposes the guard threshold", () => {
    expect(STREAM_LEAF_THRESHOLD).toBe(20);
  });
});
