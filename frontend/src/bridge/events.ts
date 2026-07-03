import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/appStore";
import type { Message, TreeNode } from "../types";

/** Wire Wails backend events into the Zustand store. Call once on mount; returns a cleanup fn. */
export function initEventBridge(): () => void {
  EventsOn("mqtt:messages", (ms: Message[]) => useAppStore.getState().pushMessages(ms));
  EventsOn("mqtt:tree", (t: TreeNode) => useAppStore.getState().setTree(t));
  EventsOn("mqtt:status", (text: string) => {
    const connected = text === "connected";
    useAppStore.getState().setStatus(connected ? "connected" : "disconnected");
  });
  return () => EventsOff("mqtt:messages", "mqtt:tree", "mqtt:status");
}
