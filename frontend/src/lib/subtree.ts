import type { TreeNode } from "../types";

/**
 * Above this many leaf topics a selection is summarized instead of streamed.
 * The bound is on subtree *size*, not depth, so it holds for any broker's
 * topic layout — a depth rule would only be correct for one of them.
 */
export const STREAM_LEAF_THRESHOLD = 20;

/** Number of leaf topics at or below a node (a leaf counts as one). */
export function leafCount(node: TreeNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + leafCount(c), 0);
}

/** Find a node by its full topic path. Returns null when absent. */
export function findNode(root: TreeNode | null, fullTopic: string): TreeNode | null {
  if (!root) return null;
  const stack: TreeNode[] = root.children ? [...root.children] : [];
  while (stack.length) {
    const n = stack.pop() as TreeNode;
    if (n.fullTopic === fullTopic) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

export interface TopTopic {
  topic: string;
  count: number;
  preview: string;
}

/** The busiest leaf topics below a node, for the subtree summary panel. */
export function topTopics(node: TreeNode, limit: number): TopTopic[] {
  const out: TopTopic[] = [];
  const walk = (n: TreeNode) => {
    if (!n.children || n.children.length === 0) {
      out.push({ topic: n.fullTopic, count: n.messageCount, preview: n.preview ?? "" });
      return;
    }
    n.children.forEach(walk);
  };
  walk(node);
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, limit);
}
