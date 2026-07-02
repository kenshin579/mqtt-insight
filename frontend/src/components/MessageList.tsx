import { useEffect, useState } from "react";
import { FixedSizeList } from "react-window";
import { useAppStore } from "../store/appStore";
import { History, QueryRecorded } from "../../wailsjs/go/main/App";
import { bytesToString } from "../lib/payload";
import { MessageDetail } from "./MessageDetail";
import type { Message } from "../types";

type Source = "live" | "recorded";

export function MessageList() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const liveMessages = useAppStore((s) => s.liveMessages);
  const paused = useAppStore((s) => s.paused);
  const togglePaused = useAppStore((s) => s.togglePaused);
  const clear = useAppStore((s) => s.clear);
  const recording = useAppStore((s) => s.recording);
  const [history, setHistory] = useState<Message[]>([]);
  const [recorded, setRecorded] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [source, setSource] = useState<Source>("live");

  const isRecorded = !!selectedTopic && recording.has(selectedTopic);

  // Topic change resets to live view.
  useEffect(() => {
    setSource("live");
    setRecorded([]);
  }, [selectedTopic]);

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

  useEffect(() => {
    if (source === "recorded") loadRecorded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // For a selected topic, the backend ring buffer (History) is authoritative and already
  // includes live messages; for no selection, show the cross-topic live stream.
  const rows = source === "recorded" ? recorded : selectedTopic ? history : liveMessages;

  return (
    <div className="msg-list">
      <div className="msg-toolbar">
        <span>{selectedTopic || "All topics (live)"}</span>
        {isRecorded && (
          <span className="src-toggle">
            <button className={source === "live" ? "on" : ""} onClick={() => setSource("live")}>Live</button>
            <button className={source === "recorded" ? "on" : ""} onClick={() => setSource("recorded")}>Recorded</button>
          </span>
        )}
        {source === "recorded" ? (
          <button onClick={loadRecorded}>Refresh</button>
        ) : (
          <>
            <button onClick={togglePaused}>{paused ? "Resume" : "Pause"}</button>
            <button onClick={clear}>Clear</button>
          </>
        )}
      </div>
      <div className="msg-split">
        {rows.length === 0 && source === "recorded" ? (
          <div className="meta">no recorded messages</div>
        ) : (
          <FixedSizeList height={300} width={"100%"} itemCount={rows.length} itemSize={22}>
            {({ index, style }: { index: number; style: React.CSSProperties }) => {
              const m = rows[rows.length - 1 - index];
              return (
                <div style={style} className="msg-row" onClick={() => setSelected(m)}>
                  <span className="ts">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  <span className="topic">{m.topic}</span>
                  <span className="preview">{bytesToString(m.payload).slice(0, 60)}</span>
                  {m.retained && <span className="badge">R</span>}
                  <span className="qos">q{m.qos}</span>
                </div>
              );
            }}
          </FixedSizeList>
        )}
        {selected && <MessageDetail key={`${selected.topic}-${selected.timestamp}`} msg={selected} />}
      </div>
    </div>
  );
}
