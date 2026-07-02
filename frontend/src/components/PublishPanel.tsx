import { useState } from "react";
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

export function PublishPanel() {
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const [topic, setTopic] = useState("");
  const [payload, setPayload] = useState("");
  const [qos, setQos] = useState(0);
  const [retained, setRetained] = useState(false);

  async function publish() {
    const t = topic || selectedTopic || "";
    if (!t) return;
    const m = mqtt.Message.createFrom({ topic: t, qos, retained, timestamp: new Date().toISOString() });
    (m as unknown as { payload: string }).payload = toBase64(payload);
    await Publish(m);
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
      <textarea placeholder="payload" value={payload} onChange={(e) => setPayload(e.target.value)} />
    </div>
  );
}
