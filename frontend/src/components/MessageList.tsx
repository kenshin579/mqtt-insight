import { useEffect, useState } from "react";
import { FixedSizeList } from "react-window";
import { useAppStore } from "../store/appStore";
import { History } from "../../wailsjs/go/main/App";
import { bytesToString } from "../lib/payload";
import { MessageDetail } from "./MessageDetail";
import type { Message } from "../types";

export function MessageList() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const liveMessages = useAppStore((s) => s.liveMessages);
  const paused = useAppStore((s) => s.paused);
  const togglePaused = useAppStore((s) => s.togglePaused);
  const clear = useAppStore((s) => s.clear);
  const [history, setHistory] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);

  useEffect(() => {
    if (!selectedTopic) { setHistory([]); return; }
    History(selectedTopic).then((h) => setHistory((h || []) as unknown as Message[]));
  }, [selectedTopic, liveMessages]);

  // For a selected topic, the backend ring buffer (History) is authoritative and already
  // includes live messages; for no selection, show the cross-topic live stream.
  const rows = selectedTopic ? history : liveMessages;

  return (
    <div className="msg-list">
      <div className="msg-toolbar">
        <span>{selectedTopic || "All topics (live)"}</span>
        <button onClick={togglePaused}>{paused ? "Resume" : "Pause"}</button>
        <button onClick={clear}>Clear</button>
      </div>
      <div className="msg-split">
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
        {selected && <MessageDetail key={`${selected.topic}-${selected.timestamp}`} msg={selected} />}
      </div>
    </div>
  );
}
