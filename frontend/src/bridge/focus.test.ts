import { describe, it, expect, beforeEach, vi } from "vitest";
import { STREAM_LEAF_THRESHOLD } from "../lib/subtree";
import type { Message } from "../types";

// The Wails binding is generated code that talks to the Go side; stub it so the
// guard's decision and the call it makes are both observable.
const setFocus = vi.fn<(topic: string) => Promise<Message[] | null>>();
vi.mock("../../wailsjs/go/main/App", () => ({ SetFocus: (t: string) => setFocus(t) }));

const { applyFocus } = await import("./focus");
const { useAppStore } = await import("../store/appStore");

function msg(topic: string, ts: string): Message {
  return { topic, payload: "", qos: 0, retained: false, timestamp: ts };
}

describe("applyFocus size guard", () => {
  beforeEach(() => {
    setFocus.mockReset();
    setFocus.mockResolvedValue([]);
    useAppStore.getState().resetSession();
  });

  it("streams a selection at the threshold", async () => {
    setFocus.mockResolvedValue([msg("a/b", "1")]);
    await applyFocus("a/b", false, STREAM_LEAF_THRESHOLD);

    expect(setFocus).toHaveBeenCalledWith("a/b");
    const st = useAppStore.getState();
    expect(st.selectedTopic).toBe("a/b");
    expect(st.summaryTopic).toBeNull();
    expect(st.focusMessages).toHaveLength(1);
  });

  it("summarizes one leaf past the threshold instead of streaming", async () => {
    await applyFocus("a/b", false, STREAM_LEAF_THRESHOLD + 1);

    // The empty string is what stops the backend stream. Passing the topic here
    // would put the firehose back, which is the whole point of the guard.
    expect(setFocus).toHaveBeenCalledWith("");
    const st = useAppStore.getState();
    expect(st.summaryTopic).toBe("a/b");
    expect(st.selectedTopic).toBeNull();
    expect(st.focusMessages).toHaveLength(0);
  });

  it("stops the stream before showing the summary", async () => {
    // Ordering matters: showing the summary first would leave the backend
    // streaming a huge subtree while the UI claims it is not.
    const order: string[] = [];
    setFocus.mockImplementation(async (t: string) => {
      order.push(`setFocus(${t})`);
      return [];
    });
    const unsub = useAppStore.subscribe((s) => {
      if (s.summaryTopic) order.push("summary");
    });
    await applyFocus("a/b", false, 999);
    unsub();

    expect(order[0]).toBe("setFocus()");
    expect(order).toContain("summary");
  });

  it("clears the backend focus when the selection is dropped", async () => {
    await applyFocus(null, true, 1);

    expect(setFocus).toHaveBeenCalledWith("");
    const st = useAppStore.getState();
    expect(st.selectedTopic).toBeNull();
    expect(st.summaryTopic).toBeNull();
  });

  it("tolerates a null history from the backend", async () => {
    // SetFocus returns nil for an unknown topic or a disconnected client, which
    // arrives as null rather than an empty array.
    setFocus.mockResolvedValue(null);
    await applyFocus("a/b", true, 1);

    expect(useAppStore.getState().focusMessages).toEqual([]);
  });
});
