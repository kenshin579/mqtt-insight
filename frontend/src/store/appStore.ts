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
  clearedAt: Record<string, number>; // topic -> ms epoch; Clear applies to the selected topic only (F3)
  pubTopic: string; pubHint: boolean;
  treeHintDismissed: boolean; recToastShown: boolean;
  settings: SettingsState;
  // update
  version: string; // build version from Go; "" until GetVersion resolves
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
  setVersion: (v: string) => void;
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
  diffOn: false, fmt: "json", detailMode: "message", clearedAt: {},
  pubTopic: "", pubHint: false,
  treeHintDismissed: false, recToastShown: false,
  settings: { lang: "ko", theme: "dark", defaultFormat: "plain", timestampFormat: "absolute", messageOrder: "newest", ringBufferSize: 200, checkUpdates: true },
  version: "", updateInfo: null, updateProgress: null, updateError: null,

  setStatus: (s, attempt = 0) => set({ status: s, attempt }),
  setBroker: (b) => set({ broker: b }),
  setConnectError: (e) => set({ connectError: e }),
  setActiveVersion: (v) => set({ activeVersion: v }),
  setTree: (t) => set({ tree: t }),
  // A batch carries the focus it was filtered with, so one comparison discards
  // anything produced before the user moved to another topic.
  //
  // Not filtered against clearedAt: a live push is almost always newer than any
  // clear recorded against the current selection, so checking would be dead
  // weight on the hot path. (focusTopic applies clearedAt once, on selection,
  // where it actually matters — see there.)
  //
  // "Almost always" is the honest word: a message the batcher received just
  // before the Clear but had not flushed yet arrives afterwards carrying the
  // older timestamp, so it survives a clear it arguably predates. The window is
  // bounded by the 50ms flush interval. The old implementation re-filtered every
  // row on every render and so caught this; that is precisely the per-render
  // work this change exists to remove.
  //
  // Known accepted race: SetFocus sets the backend focus and reads that topic's
  // buffered history as two separate steps, unlocked in between. A batcher flush
  // landing in that gap can both (a) emit the message live, tagged with the new
  // focus, and (b) already be included in the history SetFocus reads — so the
  // same message can arrive here twice for one selection. This is deliberate:
  // the alternative ordering (read history, then set focus) turns a rare visible
  // duplicate into a rare silently-dropped message, which is worse for a
  // debugging tool. Not de-duplicated here either, for the same hot-path reason
  // as clearedAt above.
  pushMessages: (batch) => {
    const st = get();
    if (batch.focus !== (st.selectedTopic ?? "")) return;
    set({
      focusMessages: [...st.focusMessages, ...batch.messages].slice(-MAX_FOCUS),
      dropped: st.dropped + batch.dropped,
    });
  },
  setRate: (r) => set({ rate: r }),
  // Filters the incoming history once, against any clear previously recorded for
  // this topic, so re-selecting a topic after Clear doesn't resurrect what was
  // wiped from the display — the backend buffer was never told about the clear
  // and still has it. One-time cost per selection, not per push or per render.
  focusTopic: (t, isLeaf, msgs) => {
    const st = get();
    const threshold = t !== null ? st.clearedAt[t] : undefined;
    const kept = threshold ? msgs.filter((m) => new Date(m.timestamp).getTime() > threshold) : msgs;
    const rows = kept.slice(-MAX_FOCUS);
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
      searchOpen: false, searchQuery: "",
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
  // everything. New pushes simply append after it (pushMessages, unfiltered).
  // Recording the timestamp under the *selected* topic is what stops a later
  // re-selection of that same topic (focusTopic) from pulling the wiped
  // messages back in from the backend's still-intact buffer.
  //
  // selectedTopic is null only when nothing is focused, and the Clear control
  // is only ever shown while a topic is selected (§7.1) — so that branch is
  // unreachable from the UI. Kept as a no-op guard rather than assuming the
  // caller always has a topic, since the action itself doesn't take one.
  clearMessages: () => {
    const st = get();
    const topic = st.selectedTopic;
    set({
      focusMessages: [], selectedMsg: null, dropped: 0,
      ...(topic !== null ? { clearedAt: { ...st.clearedAt, [topic]: Date.now() } } : {}),
    });
  },
  setPubTopic: (t, hint) => set({ pubTopic: t, pubHint: hint }),
  dismissTreeHint: () => set({ treeHintDismissed: true }),
  markRecToastShown: () => set({ recToastShown: true }),
  setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  setVersion: (v) => set({ version: v }),
  setUpdateInfo: (i) => set({ updateInfo: i }),
  setUpdateProgress: (p) => set({ updateProgress: p }),
  setUpdateError: (e) => set({ updateError: e }),
  resetSession: () =>
    set({
      tree: null, focusMessages: [], rate: { global: 0, focused: 0 }, dropped: 0,
      subs: [], selectedTopic: null, selectedIsLeaf: true, summaryTopic: null,
      selectedMsg: null, msgSource: "live", paused: false,
      searchOpen: false, searchQuery: "", clearedAt: {},
      pubTopic: "", pubHint: false, connectError: null, attempt: 0,
    }),
}));
