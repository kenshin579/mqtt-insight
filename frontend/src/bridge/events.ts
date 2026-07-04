import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/appStore";
import type { Message, TreeNode, StatusEvent, UpdateInfo } from "../types";

/** Wire Wails backend events into the store. Call once on mount; returns cleanup. */
export function initEventBridge(): () => void {
  EventsOn("mqtt:messages", (ms: Message[]) => useAppStore.getState().pushMessages(ms));
  EventsOn("mqtt:tree", (t: TreeNode) => useAppStore.getState().setTree(t));
  EventsOn("mqtt:status", (e: StatusEvent) => {
    const st = useAppStore.getState();
    st.setStatus(e.state, e.attempt);
    // reason은 연결 시도 실패 컨텍스트에서만 배너로 씀 — Connect 호출부가 처리.
  });
  EventsOn("update:available", (i: UpdateInfo) => useAppStore.getState().setUpdateInfo(i));
  EventsOn("update:progress", (p: number) => useAppStore.getState().setUpdateProgress(p));
  EventsOn("update:error", (msg: string) => {
    const st = useAppStore.getState();
    st.setUpdateProgress(null);
    st.setUpdateError(msg);
  });
  return () =>
    EventsOff("mqtt:messages", "mqtt:tree", "mqtt:status", "update:available", "update:progress", "update:error");
}
