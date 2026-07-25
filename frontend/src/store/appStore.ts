import { create } from "zustand";
import type { Message, TreeNode, Status, UpdateInfo, FocusBatch, RateEvent } from "../types";
import type { Sub } from "../lib/mqttMatch";
import type { ConnectError } from "../lib/connectError";
import type { Lang } from "../lib/i18n";

export type MsgSource = "live" | "recorded";
export type Fmt = "json" | "plain" | "hex" | "base64";

export interface SettingsState {
  lang: Lang; theme: "dark" | "light" | "system";
  defaultFormat: Fmt; timestampFormat: "absolute" | "relative";
  messageOrder: "newest" | "oldest"; ringBufferSize: number;
  checkUpdates: boolean;
}

interface AppState {
  // connection
  status: Status; broker: string; attempt: number;
  connectError: ConnectError | null;
  activeVersion: string; // "5.0" | "3.1.1" — 연결에 쓴 프로필의 버전 (B40 비활성 판단)
  // data
  tree: TreeNode | null;
  focusMessages: Message[]; // messages of the focused subtree only
  rate: RateEvent;          // backend-computed msg/s
  dropped: number;          // messages the backend skipped to hold the emit cap
  subs: Sub[]; recording: Set<string>;
  selectedTopic: string | null;  // streaming selection (also the backend focus)
  selectedIsLeaf: boolean;       // false = subtree selection, so rows show their topic
  summaryTopic: string | null;   // selection too wide to stream — summary shown instead
  selectedMsg: Message | null;
  msgSource: MsgSource;
  // ui
  paused: boolean; searchOpen: boolean; searchQuery: string;
  diffOn: boolean; fmt: Fmt;
  detailMode: "message" | "chart";
  pubTopic: string; pubHint: boolean;
  treeHintDismissed: boolean; recToastShown: boolean;
  settings: SettingsState;
  // update
  updateInfo: UpdateInfo | null;
  updateProgress: number | null; // null = 진행 중 아님
  updateError: string | null;
  // actions
  setStatus: (s: Status, attempt?: number) => void;
  setBroker: (b: string) => void;
  setConnectError: (e: ConnectError | null) => void;
  setActiveVersion: (v: string) => void;
  setTree: (t: TreeNode) => void;
  pushMessages: (batch: FocusBatch) => void;
  setRate: (r: RateEvent) => void;
  focusTopic: (t: string | null, isLeaf: boolean, msgs: Message[]) => void;
  showSubtreeSummary: (t: string) => void;
  addSub: (pattern: string, qos: number) => boolean; // false = 중복/빈값
  removeSub: (pattern: string) => void;
  selectMsg: (m: Message | null) => void;
  setMsgSource: (s: MsgSource) => void;
  setRecordingTopics: (ts: string[]) => void;
  toggleRecordingTopic: (t: string) => void;
  togglePaused: () => void;
  setSearch: (open: boolean, query?: string) => void;
  toggleDiff: () => void;
  setFmt: (f: Fmt) => void;
  setDetailMode: (m: "message" | "chart") => void;
  clearMessages: () => void; // F3
  setPubTopic: (t: string, hint: boolean) => void;
  dismissTreeHint: () => void;
  markRecToastShown: () => void;
  setSettings: (s: Partial<SettingsState>) => void;
  setUpdateInfo: (i: UpdateInfo | null) => void;
  setUpdateProgress: (p: number | null) => void;
  setUpdateError: (e: string | null) => void;
  resetSession: () => void; // 새 연결 시(C4/C12): 데이터·구독·선택 초기화
}

/** Ring cap for the focused stream. Display bound — unrelated to settings.ringBufferSize,
 *  which is how many messages the Go store keeps per topic. */
export const MAX_FOCUS = 500;

export const useAppStore = create<AppState>((set, get) => ({
  status: "disconnected", broker: "", attempt: 0,
  connectError: null, activeVersion: "5.0",
  tree: null, focusMessages: [], rate: { global: 0, focused: 0 }, dropped: 0,
  subs: [], recording: new Set<string>(),
  selectedTopic: null, selectedIsLeaf: true, summaryTopic: null,
  selectedMsg: null, msgSource: "live",
  paused: false, searchOpen: false, searchQuery: "",
  diffOn: false, fmt: "json", detailMode: "message",
  pubTopic: "", pubHint: false,
  treeHintDismissed: false, recToastShown: false,
  settings: { lang: "ko", theme: "dark", defaultFormat: "plain", timestampFormat: "absolute", messageOrder: "newest", ringBufferSize: 200, checkUpdates: true },
  updateInfo: null, updateProgress: null, updateError: null,

  setStatus: (s, attempt = 0) => set({ status: s, attempt }),
  setBroker: (b) => set({ broker: b }),
  setConnectError: (e) => set({ connectError: e }),
  setActiveVersion: (v) => set({ activeVersion: v }),
  setTree: (t) => set({ tree: t }),
  // A batch carries the focus it was filtered with, so one comparison discards
  // anything produced before the user moved to another topic.
  pushMessages: (batch) => {
    const st = get();
    if (batch.focus !== (st.selectedTopic ?? "")) return;
    set({
      focusMessages: [...st.focusMessages, ...batch.messages].slice(-MAX_FOCUS),
      dropped: st.dropped + batch.dropped,
    });
  },
  setRate: (r) => set({ rate: r }),
  focusTopic: (t, isLeaf, msgs) => {
    const rows = msgs.slice(-MAX_FOCUS);
    set({
      selectedTopic: t, selectedIsLeaf: isLeaf, summaryTopic: null,
      focusMessages: rows, selectedMsg: rows.length ? rows[rows.length - 1] : null,
      dropped: 0, msgSource: "live", paused: false,
      ...(t ? { pubTopic: t, pubHint: true } : {}),
    });
  },
  showSubtreeSummary: (t) =>
    set({
      summaryTopic: t, selectedTopic: null, selectedIsLeaf: true,
      focusMessages: [], selectedMsg: null, dropped: 0, msgSource: "live", paused: false,
    }),
  addSub: (pattern, qos) => {
    const p = pattern.trim();
    if (!p || get().subs.some((s) => s.pattern === p)) return false;
    set({ subs: [...get().subs, { pattern: p, qos }] });
    return true;
  },
  removeSub: (pattern) => set({ subs: get().subs.filter((s) => s.pattern !== pattern) }),
  selectMsg: (m) => set({ selectedMsg: m }),
  setMsgSource: (s) => set({ msgSource: s }),
  setRecordingTopics: (ts) => set({ recording: new Set(ts) }),
  toggleRecordingTopic: (t) => {
    const next = new Set(get().recording);
    next.has(t) ? next.delete(t) : next.add(t);
    set({ recording: next });
  },
  togglePaused: () => set({ paused: !get().paused }),
  setSearch: (open, query) => set({ searchOpen: open, searchQuery: open ? (query ?? get().searchQuery) : "" }),
  toggleDiff: () => {
    const on = !get().diffOn;
    set({ diffOn: on, ...(on ? { fmt: "json" as Fmt } : {}) }); // C33: 켜면 JSON 강제
  },
  setFmt: (f) => set({ fmt: f }),
  setDetailMode: (m) => set({ detailMode: m }),
  // Clear wipes the displayed stream only — the Go store and any recording keep
  // everything. New pushes simply append after it.
  clearMessages: () => set({ focusMessages: [], selectedMsg: null, dropped: 0 }),
  setPubTopic: (t, hint) => set({ pubTopic: t, pubHint: hint }),
  dismissTreeHint: () => set({ treeHintDismissed: true }),
  markRecToastShown: () => set({ recToastShown: true }),
  setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  setUpdateInfo: (i) => set({ updateInfo: i }),
  setUpdateProgress: (p) => set({ updateProgress: p }),
  setUpdateError: (e) => set({ updateError: e }),
  resetSession: () =>
    set({
      tree: null, focusMessages: [], rate: { global: 0, focused: 0 }, dropped: 0,
      subs: [], selectedTopic: null, selectedIsLeaf: true, summaryTopic: null,
      selectedMsg: null, msgSource: "live", paused: false,
      searchOpen: false, searchQuery: "",
      pubTopic: "", pubHint: false, connectError: null, attempt: 0,
    }),
}));
