import { useEffect, useState } from "react";
import { Publish } from "../../wailsjs/go/main/App";
import { mqtt } from "../../wailsjs/go/models";
import { useAppStore } from "../store/appStore";

// Go []byte is unmarshaled from a base64 STRING over the wire, so encode payload to base64.
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

interface UserProp { key: string; value: string; }

export function PublishPanel() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const pubTopic = useAppStore((s) => s.pubTopic);
  const pubHint = useAppStore((s) => s.pubHint);
  const setPubTopic = useAppStore((s) => s.setPubTopic);
  const [topic, setTopic] = useState("");
  const [payload, setPayload] = useState("");
  const [qos, setQos] = useState(0);
  const [retained, setRetained] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [contentType, setContentType] = useState("");
  const [responseTopic, setResponseTopic] = useState("");
  const [userProps, setUserProps] = useState<UserProp[]>([]);

  // "이 토픽에 발행" from the tree context menu (or tree selection) fills the topic input.
  useEffect(() => {
    if (pubHint && pubTopic) {
      setTopic(pubTopic);
      setPubTopic(pubTopic, false);
    }
  }, [pubHint, pubTopic, setPubTopic]);

  async function publish() {
    const t = topic || selectedTopic || "";
    if (!t) return;
    const props = userProps.filter((p) => p.key !== "");
    const m = mqtt.Message.createFrom({
      topic: t,
      qos,
      retained,
      timestamp: new Date().toISOString(),
      ...(contentType ? { contentType } : {}),
      ...(responseTopic ? { responseTopic } : {}),
      ...(props.length ? { userProps: props } : {}),
    });
    (m as unknown as { payload: string }).payload = toBase64(payload);
    await Publish(m);
  }

  function updProp(i: number, k: keyof UserProp, v: string) {
    setUserProps(userProps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }

  return (
    <div className="publish-panel">
      <div className="pub-row">
        <input placeholder={selectedTopic || "topic"} value={topic} onChange={(e) => setTopic(e.target.value)} />
        <select value={qos} onChange={(e) => setQos(+e.target.value)}>
          <option value={0}>QoS 0</option><option value={1}>QoS 1</option><option value={2}>QoS 2</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={retained} onChange={(e) => setRetained(e.target.checked)} /> retain
        </label>
        <button onClick={publish}>Publish</button>
      </div>
      <button className="props-toggle" onClick={() => setShowProps(!showProps)}>
        {showProps ? "▾" : "▸"} MQTT 5.0 Properties
      </button>
      {showProps && (
        <div className="props-section">
          <div className="meta">5.0 연결 전용 — 3.1.1에서는 무시됩니다</div>
          <div className="pub-row">
            <input placeholder="content-type" value={contentType} onChange={(e) => setContentType(e.target.value)} />
            <input placeholder="response topic" value={responseTopic} onChange={(e) => setResponseTopic(e.target.value)} />
          </div>
          {userProps.map((p, i) => (
            <div className="pub-row" key={i}>
              <input placeholder="key" value={p.key} onChange={(e) => updProp(i, "key", e.target.value)} />
              <input placeholder="value" value={p.value} onChange={(e) => updProp(i, "value", e.target.value)} />
              <button onClick={() => setUserProps(userProps.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <button onClick={() => setUserProps([...userProps, { key: "", value: "" }])}>+ user property</button>
        </div>
      )}
      <textarea placeholder="payload" value={payload} onChange={(e) => setPayload(e.target.value)} />
    </div>
  );
}
