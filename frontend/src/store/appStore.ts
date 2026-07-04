import { create } from "zustand";
import type { Message, TreeNode, Status } from "../types";
import type { Sub } from "../lib/mqttMatch";
import type { ConnectError } from "../lib/connectError";
import type { Lang } from "../lib/i18n";

export type MsgSource = "live" | "recorded";
export type Fmt = "json" | "plain" | "hex" | "base64";

export interface SettingsState {
  lang: Lang; theme: "dark" | "light" | "system";
  defaultFormat: Fmt; timestampFormat: "absolute" | "relative";
  messageOrder: "newest" | "oldest"; ringBufferSize: number;
}

interface AppState {
  // connection
  status: Status; broker: string; attempt: number;
  connectError: ConnectError | null;
  activeVersion: string; // "5.0" | "3.1.1" — 연결에 쓴 프로필의 버전 (B40 비활성 판단)
  // data
  tree: TreeNode | null; liveMessages: Message[];
  subs: Sub[]; recording: Set<string>;
  selectedTopic: string | null; selectedMsg: Message | null;
  msgSource: MsgSource;
  // ui
  paused: boolean; searchOpen: boolean; searchQuery: string;
  diffOn: boolean; fmt: Fmt;
  clearedAt: Record<string, number>; // topic -> ms epoch; "" = all-topics baseline (F3)
  pubTopic: string; pubHint: boolean;
  treeHintDismissed: boolean; recToastShown: boolean;
  settings: SettingsState;
  // actions
  setStatus: (s: Status, attempt?: number) => void;
  setBroker: (b: string) => void;
  setConnectError: (e: ConnectError | null) => void;
  setActiveVersion: (v: string) => void;
  setTree: (t: TreeNode) => void;
  pushMessages: (ms: Message[]) => void;
  addSub: (pattern: string, qos: number) => boolean; // false = 중복/빈값
  removeSub: (pattern: string) => void;
  selectTopic: (t: string | null, latest?: Message | null) => void;
  selectMsg: (m: Message | null) => void;
  setMsgSource: (s: MsgSource) => void;
  setRecordingTopics: (ts: string[]) => void;
  toggleRecordingTopic: (t: string) => void;
  togglePaused: () => void;
  setSearch: (open: boolean, query?: string) => void;
  toggleDiff: () => void;
  setFmt: (f: Fmt) => void;
  clearMessages: (topic: string | null) => void; // F3
  setPubTopic: (t: string, hint: boolean) => void;
  dismissTreeHint: () => void;
  markRecToastShown: () => void;
  setSettings: (s: Partial<SettingsState>) => void;
  resetSession: () => void; // 새 연결 시(C4/C12): 데이터·구독·선택 초기화
}

const MAX_LIVE = 500;

export const useAppStore = create<AppState>((set, get) => ({
  status: "disconnected", broker: "", attempt: 0,
  connectError: null, activeVersion: "5.0",
  tree: null, liveMessages: [], subs: [], recording: new Set<string>(),
  selectedTopic: null, selectedMsg: null, msgSource: "live",
  paused: false, searchOpen: false, searchQuery: "",
  diffOn: false, fmt: "json", clearedAt: {},
  pubTopic: "", pubHint: false,
  treeHintDismissed: false, recToastShown: false,
  settings: { lang: "ko", theme: "dark", defaultFormat: "plain", timestampFormat: "absolute", messageOrder: "newest", ringBufferSize: 200 },

  setStatus: (s, attempt = 0) => set({ status: s, attempt }),
  setBroker: (b) => set({ broker: b }),
  setConnectError: (e) => set({ connectError: e }),
  setActiveVersion: (v) => set({ activeVersion: v }),
  setTree: (t) => set({ tree: t }),
  // F24: paused여도 수신은 계속 쌓는다(표시는 컴포넌트가 pause 시점 스냅샷). 단순화:
  // liveMessages는 항상 갱신하고, MessageList가 paused일 때 이전 rows를 유지한다.
  pushMessages: (ms) => set({ liveMessages: [...get().liveMessages, ...ms].slice(-MAX_LIVE) }),
  addSub: (pattern, qos) => {
    const p = pattern.trim();
    if (!p || get().subs.some((s) => s.pattern === p)) return false;
    set({ subs: [...get().subs, { pattern: p, qos }] });
    return true;
  },
  removeSub: (pattern) => set({ subs: get().subs.filter((s) => s.pattern !== pattern) }),
  selectTopic: (t, latest = null) =>
    set({ selectedTopic: t, selectedMsg: latest, msgSource: "live", ...(t ? { pubTopic: t, pubHint: true } : {}) }),
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
  // F3: clears the display only — History/QueryRecorded stay backend-owned, rows filter by clearedAt.
  clearMessages: (topic) => {
    const key = topic ?? "";
    set({
      clearedAt: { ...get().clearedAt, [key]: Date.now() },
      selectedMsg: null,
      ...(topic === null ? { liveMessages: [] } : {}),
    });
  },
  setPubTopic: (t, hint) => set({ pubTopic: t, pubHint: hint }),
  dismissTreeHint: () => set({ treeHintDismissed: true }),
  markRecToastShown: () => set({ recToastShown: true }),
  setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  resetSession: () =>
    set({
      tree: null, liveMessages: [], subs: [], selectedTopic: null, selectedMsg: null,
      msgSource: "live", paused: false, searchOpen: false, searchQuery: "",
      pubTopic: "", pubHint: false, connectError: null, attempt: 0, clearedAt: {},
    }),
}));
