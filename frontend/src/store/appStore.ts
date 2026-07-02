import { create } from "zustand";
import type { Message, TreeNode, Status } from "../types";

interface AppState {
  status: Status;
  statusText: string;
  tree: TreeNode | null;
  selectedTopic: string | null;
  paused: boolean;
  liveMessages: Message[];
  setStatus: (s: Status, text?: string) => void;
  setTree: (t: TreeNode) => void;
  selectTopic: (t: string | null) => void;
  togglePaused: () => void;
  pushMessages: (ms: Message[]) => void;
  clear: () => void;
}

const MAX_LIVE = 500;

export const useAppStore = create<AppState>((set, get) => ({
  status: "disconnected",
  statusText: "",
  tree: null,
  selectedTopic: null,
  paused: false,
  liveMessages: [],
  setStatus: (s, text = "") => set({ status: s, statusText: text }),
  setTree: (t) => set({ tree: t }),
  selectTopic: (t) => set({ selectedTopic: t }),
  togglePaused: () => set({ paused: !get().paused }),
  pushMessages: (ms) => {
    if (get().paused) return;
    const next = [...get().liveMessages, ...ms].slice(-MAX_LIVE);
    set({ liveMessages: next });
  },
  clear: () => set({ liveMessages: [], tree: null }),
}));
