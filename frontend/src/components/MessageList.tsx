import { useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList } from "react-window";
import { useAppStore } from "../store/appStore";
import { QueryRecorded } from "../../wailsjs/go/main/App";
import { bytesToString } from "../lib/payload";
import { formatTime, useNowTick } from "../lib/time";
import { t } from "../lib/i18n";
import { MessageDetail } from "./MessageDetail";
import { SubtreeSummary } from "./SubtreeSummary";
import { SearchBar } from "./SearchBar";
import { SegmentedControl } from "./SegmentedControl";
import type { Message } from "../types";

export function MessageList() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const selectedIsLeaf = useAppStore((s) => s.selectedIsLeaf);
  const summaryTopic = useAppStore((s) => s.summaryTopic);
  const focusMessages = useAppStore((s) => s.focusMessages);
  const dropped = useAppStore((s) => s.dropped);
  const rate = useAppStore((s) => s.rate);
  const paused = useAppStore((s) => s.paused);
  const togglePaused = useAppStore((s) => s.togglePaused);
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

  const [recorded, setRecorded] = useState<Message[]>([]);
  const isRecordable = !!selectedTopic && recording.has(selectedTopic);

  // G13: stuck guard — if the topic stops being recordable (or is deselected) while
  // viewing Recorded, the Live/Recorded toggle disappears; fall back to live so the
  // view can never get stuck showing a control that no longer exists.
  useEffect(() => {
    if (!isRecordable && msgSource === "recorded") setMsgSource("live");
  }, [isRecordable, msgSource, setMsgSource]);

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

  // Live rows are pushed by the backend for the focused subtree only — no polling.
  const sourceRows: Message[] = msgSource === "recorded" ? recorded : focusMessages;

  // F24: pause freezes the displayed rows at a snapshot; ingestion continues live.
  const snapshotRef = useRef<Message[]>([]);
  const wasPaused = useRef(false);
  if (paused && !wasPaused.current) snapshotRef.current = sourceRows;
  wasPaused.current = paused;
  const baseRows = msgSource === "recorded" ? sourceRows : paused ? snapshotRef.current : sourceRows;

  // F1: once rows exist for a selected topic with nothing selected yet, pick the newest.
  useEffect(() => {
    if (selectedTopic && !selectedMsg && baseRows.length > 0) selectMsg(baseRows[baseRows.length - 1]);
  }, [selectedTopic, selectedMsg, baseRows, selectMsg]);

  // C26/C27/F9: payload search; topic search too when a subtree is selected.
  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return baseRows;
    return baseRows.filter(
      (m) => bytesToString(m.payload).toLowerCase().includes(q) || (!selectedIsLeaf && m.topic.toLowerCase().includes(q)),
    );
  }, [baseRows, q, selectedIsLeaf]);

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

  // Rate comes from the backend, so it is no longer bounded by what the UI buffers.
  const shownRate = selectedTopic ? rate.focused : rate.global;

  // A13/B31: search-no-match takes priority, then unselected, then no-messages.
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
        <span className={"toolbar-topic mono" + (selectedTopic || summaryTopic ? " accent" : " dim")}>
          {selectedTopic || summaryTopic || t("headerNone")}
        </span>
        {shownRate > 0 && <span className="msg-rate mono">{shownRate.toFixed(1)} msg/s</span>}
        {dropped > 0 && <span className="msg-drop mono">{t("droppedRows", { n: dropped })}</span>}
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
        {selectedTopic && (
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
                <button className="msg-tool-btn" onClick={() => clearMessages()}>{t("btnClear")}</button>
              </>
            )}
          </>
        )}
      </div>

      {searchOpen && selectedTopic && <SearchBar matches={displayRows.length} total={baseRows.length} />}

      <div className="msg-split">
        <div className="msg-rows-pane" ref={areaRef}>
          {summaryTopic ? (
            <SubtreeSummary topic={summaryTopic} />
          ) : displayRows.length === 0 ? (
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
                    {!selectedIsLeaf && <span className="mr-topic">{m.topic}</span>}
                    <span className="mr-preview">{bytesToString(m.payload).slice(0, 60)}</span>
                    {m.retained && <span className="r-badge" title={t("retainedTip")}>R</span>}
                    <span className="mr-qos" title={t("qosTip")}>q{m.qos}</span>
                  </div>
                );
              }}
            </FixedSizeList>
          )}
        </div>
        {selectedMsg && !summaryTopic && <MessageDetail msg={selectedMsg} prev={prevMsg} rows={baseRows} />}
      </div>
    </div>
  );
}
