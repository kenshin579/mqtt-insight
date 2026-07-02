import { useState } from "react";
import { formatPayload, detectFormat, type Format } from "../lib/payload";
import type { Message } from "../types";

export function MessageDetail({ msg }: { msg: Message }) {
  const [fmt, setFmt] = useState<Format>(detectFormat(msg.payload));
  return (
    <div className="msg-detail">
      <div className="detail-toolbar">
        {(["plain", "json", "hex", "base64"] as Format[]).map((f) => (
          <button key={f} className={f === fmt ? "on" : ""} onClick={() => setFmt(f)}>{f}</button>
        ))}
      </div>
      <pre className="payload">{formatPayload(msg.payload, fmt)}</pre>
      {msg.contentType && <div className="meta">content-type: {msg.contentType}</div>}
      {msg.userProps?.map((u, i) => <div key={i} className="meta">{u.key}: {u.value}</div>)}
    </div>
  );
}
