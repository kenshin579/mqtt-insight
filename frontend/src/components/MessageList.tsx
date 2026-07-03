import { useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList } from "react-window";
import { useAppStore } from "../store/appStore";
import { History, QueryRecorded } from "../../wailsjs/go/main/App";
import { bytesToString } from "../lib/payload";
import { formatTime, useNowTick } from "../lib/time";
import { t } from "../lib/i18n";
import { MessageDetail } from "./MessageDetail";
import { SearchBar } from "./SearchBar";
import { SegmentedControl } from "./SegmentedControl";
import type { Message } from "../types";

const RATE_WINDOW_MS = 5000;
const ALL_TOPICS_CAP = 150; // F12

export function MessageList() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const liveMessages = useAppStore((s) => s.liveMessages);
  const paused = useAppStore((s) => s.paused);
  const togglePaused = useAppStore((s) => s.togglePaused);
  const clearedAt = useAppStore((s) => s.clearedAt);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const recording = useAppStore((s) => s.recording);
  const msgSource = useAppStore((s) => s.msgSource);
  const setMsgSource = useAppStore((s) => s.setMsgSource);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearch = useAppStore((s) => s.setSearch);
  const selectedMsg = useAppStore((s) => s.selectedMsg);
  const selectMsg = useAppStore((s) => s.selectMsg);
  const settings = useAppStore((s) => s.settings);
  const tree = useAppStore((s) => s.tree);

  const [history, setHistory] = useState<Message[]>([]);
  const [recorded, setRecorded] = useState<Message[]>([]);

  const isRecordable = !!selectedTopic && recording.has(selectedTopic);
  const hasTree = !!(tree?.children && tree.children.length);

  // G13: stuck guard — if the topic stops being recordable (or is deselected) while
  // viewing Recorded, the Live/Recorded toggle disappears; fall back to live so the
  // view can never get stuck showing a control that no longer exists.
  useEffect(() => {
    if (!isRecordable && msgSource === "recorded") setMsgSource("live");
  }, [isRecordable, msgSource, setMsgSource]);

  // G12: for a selected topic, the backend ring buffer (History) is authoritative and
  // already includes live messages; refetch whenever new live messages arrive.
  useEffect(() => {
    if (!selectedTopic) { setHistory([]); return; }
    History(selectedTopic).then((h) => setHistory((h || []) as unknown as Message[]));
  }, [selectedTopic, liveMessages]);

  function loadRecorded() {
    if (!selectedTopic) return;
    // Backend returns newest-first; renderer expects ascending rows.
    QueryRecorded(selectedTopic, 500).then((r) =>
      setRecorded(((r || []) as unknown as Message[]).slice().reverse()),
    );
  }

  // G3: auto-load whenever the toggle flips to Recorded (or the topic changes while on it).
  useEffect(() => {
    if (msgSource === "recorded") loadRecorded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgSource, selectedTopic]);

  const sourceRows: Message[] = useMemo(() => {
    if (msgSource === "recorded") return recorded;
    if (selectedTopic) return history;
    return liveMessages.slice(-ALL_TOPICS_CAP); // F12
  }, [msgSource, recorded, selectedTopic, history, liveMessages]);

  // F3: clear only affects display — filter out anything at/before the clear timestamp.
  const clearThreshold = clearedAt[selectedTopic ?? ""] ?? 0;
  const clearedRows = useMemo(
    () => (clearThreshold ? sourceRows.filter((m) => new Date(m.timestamp).getTime() > clearThreshold) : sourceRows),
    [sourceRows, clearThreshold],
  );

  // F24: pause freezes the displayed rows at a snapshot; ingestion/History/msg-s continue live.
  const snapshotRef = useRef<Message[]>([]);
  const wasPaused = useRef(false);
  if (paused && !wasPaused.current) snapshotRef.current = clearedRows;
  wasPaused.current = paused;
  const baseRows = msgSource === "recorded" ? clearedRows : paused ? snapshotRef.current : clearedRows;

  // F1 completion: once rows load for a selected topic with nothing selected yet, pick the newest.
  useEffect(() => {
    if (selectedTopic && !selectedMsg && baseRows.length > 0) selectMsg(baseRows[baseRows.length - 1]);
  }, [selectedTopic, selectedMsg, baseRows, selectMsg]);

  // C26/C27/F9: live payload (+ topic, in the all-topics view) substring search, case-insensitive.
  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return baseRows;
    return baseRows.filter(
      (m) => bytesToString(m.payload).toLowerCase().includes(q) || (!selectedTopic && m.topic.toLowerCase().includes(q)),
    );
  }, [baseRows, q, selectedTopic]);

  // D61: newest-first by default; oldest-first reverses the render order only.
  const displayRows = settings.messageOrder === "oldest" ? filtered : filtered.slice().reverse();

  // B36: the message immediately preceding the current selection in the same topic's
  // (ascending, pre-search) history — used by MessageDetail's Diff mode.
  const prevMsg = useMemo(() => {
    if (!selectedMsg) return null;
    const idx = baseRows.findIndex((m) => m.topic === selectedMsg.topic && m.timestamp === selectedMsg.timestamp);
    if (idx <= 0) return null;
    for (let i = idx - 1; i >= 0; i--) if (baseRows[i].topic === selectedMsg.topic) return baseRows[i];
    return null;
  }, [baseRows, selectedMsg]);

  useNowTick(settings.timestampFormat === "relative"); // F25

  // F4: global 5s-window message rate, ticked every second so it decays back to 0.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const recentCount = useMemo(() => {
    const cut = Date.now() - RATE_WINDOW_MS;
    return liveMessages.reduce((n, m) => (new Date(m.timestamp).getTime() > cut ? n + 1 : n), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMessages]);
  const msgRate = (recentCount / (RATE_WINDOW_MS / 1000)).toFixed(1);
  const showRate = recentCount > 0;

  // A13/B31: 3 empty states — search-no-match takes priority, then unselected, then no-messages.
  let emptyIcon = "", emptyTitle = "", emptyHint = "";
  if (q && baseRows.length > 0 && displayRows.length === 0) {
    emptyIcon = "⌕"; emptyTitle = t("searchNoRes"); emptyHint = t("searchNoResHint");
  } else if (!selectedTopic) {
    emptyIcon = "←"; emptyTitle = t("msgSelectTitle"); emptyHint = t("msgSelectHint");
  } else if (msgSource === "recorded") {
    emptyIcon = "◇"; emptyTitle = t("recEmptyTitle"); emptyHint = t("recEmptyHint");
  } else {
    emptyIcon = "◇"; emptyTitle = t("msgEmptyTitle"); emptyHint = t("msgEmptyHint");
  }

  const areaRef = useRef<HTMLDivElement>(null);
  const [rowsHeight, setRowsHeight] = useState(0);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setRowsHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="msg-list">
      <div className="msg-toolbar">
        <span className={"toolbar-topic mono" + (selectedTopic ? " accent" : " dim")}>
          {selectedTopic || t("headerAll")}
        </span>
        {showRate && <span className="msg-rate mono">{msgRate} msg/s</span>}
        {isRecordable && (
          <>
            <span className="rec-badge">● {t("recBadge")}</span>
            <SegmentedControl
              size="sm"
              options={[
                { value: "live" as const, label: t("srcLive") },
                { value: "recorded" as const, label: t("srcRec") },
              ]}
              value={msgSource}
              onChange={setMsgSource}
            />
          </>
        )}
        <span className="spacer" />
        {hasTree && (
          <>
            <button
              className={"msg-tool-btn" + (searchOpen ? " on" : "")}
              title={t("searchTitle")}
              onClick={() => setSearch(!searchOpen)}
            >
              ⌕
            </button>
            {msgSource === "recorded" ? (
              <button className="msg-tool-btn" onClick={loadRecorded}>{t("refresh")}</button>
            ) : (
              <>
                <button className={"msg-tool-btn" + (paused ? " on" : "")} onClick={togglePaused}>
                  {paused ? t("btnResume") : t("btnPause")}
                </button>
                <button className="msg-tool-btn" onClick={() => clearMessages(selectedTopic)}>{t("btnClear")}</button>
              </>
            )}
          </>
        )}
      </div>

      {searchOpen && <SearchBar matches={displayRows.length} total={baseRows.length} />}

      <div className="msg-split">
        <div className="msg-rows-pane" ref={areaRef}>
          {displayRows.length === 0 ? (
            <div className="msg-empty">
              <div className="empty-state">
                <span className="empty-icon">{emptyIcon}</span>
                <div className="empty-title">{emptyTitle}</div>
                <div className="empty-hint">{emptyHint}</div>
              </div>
            </div>
          ) : (
            <FixedSizeList height={rowsHeight || 1} width="100%" itemCount={displayRows.length} itemSize={23}>
              {({ index, style }: { index: number; style: React.CSSProperties }) => {
                const m = displayRows[index];
                const isSel = !!selectedMsg && selectedMsg.topic === m.topic && selectedMsg.timestamp === m.timestamp;
                return (
                  <div style={style} className={"msg-row" + (isSel ? " sel" : "")} onClick={() => selectMsg(m)}>
                    <span className="mr-time">{formatTime(m.timestamp, settings.timestampFormat, settings.lang)}</span>
                    {!selectedTopic && <span className="mr-topic">{m.topic}</span>}
                    <span className="mr-preview">{bytesToString(m.payload).slice(0, 60)}</span>
                    {m.retained && <span className="r-badge" title={t("retainedTip")}>R</span>}
                    <span className="mr-qos" title={t("qosTip")}>q{m.qos}</span>
                  </div>
                );
              }}
            </FixedSizeList>
          )}
        </div>
        {selectedMsg && <MessageDetail msg={selectedMsg} prev={prevMsg} />}
      </div>
    </div>
  );
}
