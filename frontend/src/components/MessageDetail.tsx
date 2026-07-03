import { useMemo } from "react";
import { useAppStore, type Fmt } from "../store/appStore";
import { formatPayload, base64ToBytes, bytesToString } from "../lib/payload";
import { formatTime } from "../lib/time";
import { diffJson, type DiffLine } from "../lib/diff";
import { t } from "../lib/i18n";
import { SegmentedControl } from "./SegmentedControl";
import type { Message } from "../types";

const FMT_OPTS: { value: Fmt; label: string }[] = [
  { value: "json", label: "JSON" },
  { value: "plain", label: "Plain" },
  { value: "hex", label: "Hex" },
  { value: "base64", label: "Base64" },
];

/** Parse a base64 payload as JSON; null when it isn't a comparable JSON value. */
function parseJson(b64: string): unknown {
  try {
    return JSON.parse(bytesToString(b64));
  } catch {
    return null;
  }
}

// props: msg = the selected message; prev = the message immediately preceding it in the
// same topic's history (passed by MessageList), used for Diff mode (B36).
export function MessageDetail({ msg, prev }: { msg: Message; prev?: Message | null }) {
  const fmt = useAppStore((s) => s.fmt); // G5/G16: session-sticky, initialized from settings.defaultFormat
  const setFmt = useAppStore((s) => s.setFmt);
  const diffOn = useAppStore((s) => s.diffOn);
  const toggleDiff = useAppStore((s) => s.toggleDiff);
  const lang = useAppStore((s) => s.settings.lang);

  // B36/C33/F15: diff only when JSON mode + both current & previous parse to comparable objects;
  // otherwise fall back to the plain render (Diff button itself stays visually active).
  const diffLines: DiffLine[] | null = useMemo(() => {
    if (!diffOn || fmt !== "json" || !prev) return null;
    return diffJson(parseJson(prev.payload), parseJson(msg.payload));
  }, [diffOn, fmt, prev, msg]);

  const size = base64ToBytes(msg.payload).length;
  const propsStr = [
    msg.contentType ? `content-type=${msg.contentType}` : null,
    msg.responseTopic ? `response-topic=${msg.responseTopic}` : null,
    ...((msg.userProps ?? []).map((u) => `${u.key}=${u.value}`)),
  ].filter(Boolean).join(" · ");

  return (
    <div className="msg-detail">
      <div className="detail-header">
        <span className="detail-label">{t("detailHeader")}</span>
        <span className="spacer" />
        <SegmentedControl size="sm" options={FMT_OPTS} value={fmt} onChange={setFmt} />
        <button className={"diff-btn" + (diffOn ? " on" : "")} title={t("diffTip")} onClick={toggleDiff}>
          Diff
        </button>
      </div>
      <div className="detail-meta">
        <div>topic&nbsp;&nbsp;<span className="dm-val">{msg.topic}</span></div>
        <div>
          time&nbsp;&nbsp;&nbsp;<span className="dm-val">{formatTime(msg.timestamp, "absolute", lang)}</span> · qos {msg.qos} · {size} B
        </div>
        {propsStr && <div>props&nbsp;&nbsp;<span className="dm-val">{propsStr}</span></div>}
      </div>
      {diffLines ? (
        <div className="diff-body">
          <div className="diff-line">{"{"}</div>
          {diffLines.map((dl, i) => (
            <div key={dl.key} className={"diff-line " + dl.kind}>
              {`  "${dl.key}": ${dl.value}${i < diffLines.length - 1 ? "," : ""}`}
              {dl.kind === "changed" && <span className="diff-prev"> ← {dl.prev}</span>}
            </div>
          ))}
          <div className="diff-line">{"}"}</div>
        </div>
      ) : (
        <pre className="payload">{formatPayload(msg.payload, fmt)}</pre>
      )}
    </div>
  );
}
