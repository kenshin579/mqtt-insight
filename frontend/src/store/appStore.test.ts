import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, MAX_FOCUS } from "./appStore";
import type { Message } from "../types";

function msg(topic: string, ts: string): Message {
  return { topic, payload: "", qos: 0, retained: false, timestamp: ts };
}

describe("appStore focus stream", () => {
  beforeEach(() => {
    useAppStore.getState().resetSession();
  });

  it("drops a batch whose focus no longer matches the selection", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    st.pushMessages({ focus: "stale/topic", messages: [msg("stale/topic", "t")], dropped: 0 });
    expect(useAppStore.getState().focusMessages).toHaveLength(0);
  });

  it("appends a batch that matches the selection", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    st.pushMessages({ focus: "a/b", messages: [msg("a/b", "t")], dropped: 0 });
    expect(useAppStore.getState().focusMessages).toHaveLength(1);
  });

  it("caps focusMessages at MAX_FOCUS", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    const many = Array.from({ length: MAX_FOCUS + 50 }, (_, i) => msg("a/b", String(i)));
    st.pushMessages({ focus: "a/b", messages: many, dropped: 0 });
    expect(useAppStore.getState().focusMessages).toHaveLength(MAX_FOCUS);
  });

  it("accumulates dropped counts", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, []);
    st.pushMessages({ focus: "a/b", messages: [], dropped: 7 });
    st.pushMessages({ focus: "a/b", messages: [], dropped: 3 });
    expect(useAppStore.getState().dropped).toBe(10);
  });

  it("focusTopic selects the newest message and clears the summary", () => {
    const st = useAppStore.getState();
    st.showSubtreeSummary("a");
    st.focusTopic("a/b", true, [msg("a/b", "1"), msg("a/b", "2")]);
    const after = useAppStore.getState();
    expect(after.selectedMsg?.timestamp).toBe("2");
    expect(after.summaryTopic).toBeNull();
  });

  it("showSubtreeSummary clears the stream state", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, [msg("a/b", "1")]);
    st.showSubtreeSummary("a");
    const after = useAppStore.getState();
    expect(after.selectedTopic).toBeNull();
    expect(after.focusMessages).toHaveLength(0);
    expect(after.summaryTopic).toBe("a");
  });

  it("showSubtreeSummary clears open search state", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, [msg("a/b", "1")]);
    st.setSearch(true, "needle");
    st.showSubtreeSummary("a");
    const after = useAppStore.getState();
    expect(after.searchOpen).toBe(false);
    expect(after.searchQuery).toBe("");
  });

  it("clearMessages records a threshold for the selected topic", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, [msg("a/b", "2020-01-01T00:00:00.000Z")]);
    const before = Date.now();
    st.clearMessages();
    const after = useAppStore.getState();
    expect(after.focusMessages).toHaveLength(0);
    expect(after.clearedAt["a/b"]).toBeGreaterThanOrEqual(before);
  });

  it("re-focusing the cleared topic drops history at or before the threshold and keeps what came after", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, [msg("a/b", "2020-01-01T00:00:00.000Z")]);
    st.clearMessages();
    const threshold = useAppStore.getState().clearedAt["a/b"];
    const before = new Date(threshold).toISOString(); // at the threshold: dropped
    const after = new Date(threshold + 1).toISOString(); // after the threshold: kept
    st.focusTopic("a/b", true, [msg("a/b", before), msg("a/b", after)]);
    const rows = useAppStore.getState().focusMessages;
    expect(rows).toHaveLength(1);
    expect(rows[0].timestamp).toBe(after);
  });

  it("a different topic is unaffected by another topic's clear threshold", () => {
    const st = useAppStore.getState();
    st.focusTopic("a/b", true, [msg("a/b", "2020-01-01T00:00:00.000Z")]);
    st.clearMessages();
    st.focusTopic("c/d", true, [msg("c/d", "2019-01-01T00:00:00.000Z")]);
    expect(useAppStore.getState().focusMessages).toHaveLength(1);
  });
});
