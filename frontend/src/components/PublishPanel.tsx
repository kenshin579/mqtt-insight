import { useState } from "react";
import { Publish } from "../../wailsjs/go/main/App";
import { mqtt } from "../../wailsjs/go/models";
import { useAppStore } from "../store/appStore";
import { t } from "../lib/i18n";

// Go []byte is unmarshaled from a base64 STRING over the wire, so encode payload to base64 (G9).
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

interface UserProp { key: string; value: string; }

export function PublishPanel() {
  const pubTopic = useAppStore((s) => s.pubTopic);
  const pubHint = useAppStore((s) => s.pubHint);
  const setPubTopic = useAppStore((s) => s.setPubTopic);
  const status = useAppStore((s) => s.status);
  const activeVersion = useAppStore((s) => s.activeVersion);
  const selectTopic = useAppStore((s) => s.selectTopic);

  const [payload, setPayload] = useState("");
  const [qos, setQos] = useState(0);
  const [retained, setRetained] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [contentType, setContentType] = useState("");
  const [responseTopic, setResponseTopic] = useState("");
  const [userProps, setUserProps] = useState<UserProp[]>([]);

  const is311 = activeVersion === "3.1.1"; // B40/G8: MQTT 5.0 properties are unavailable on 3.1.1 connections
  const validProps = userProps.filter((p) => p.key !== "");
  const propCount = (contentType ? 1 : 0) + (responseTopic ? 1 : 0) + validProps.length;
  const showProps = propsOpen && !is311;
  const connected = status === "connected";
  const canPublish = !!pubTopic && connected; // G8/C18

  // C35/F2/F32: publish regardless of pause state; on success, select the topic so
  // MessageList's F1 auto-select logic can pick up the freshly published message.
  async function publish() {
    if (!canPublish) return;
    const m = mqtt.Message.createFrom({
      topic: pubTopic,
      qos,
      retained,
      timestamp: new Date().toISOString(),
      ...(!is311 && contentType ? { contentType } : {}),
      ...(!is311 && responseTopic ? { responseTopic } : {}),
      ...(!is311 && validProps.length ? { userProps: validProps } : {}),
    });
    (m as unknown as { payload: string }).payload = toBase64(payload);
    await Publish(m);
    setTimeout(() => selectTopic(pubTopic, null), 30);
  }

  function updProp(i: number, k: keyof UserProp, v: string) {
    setUserProps(userProps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  }

  function togglePubProps() {
    if (is311) return;
    setPropsOpen((v) => !v);
  }

  return (
    <div className={"publish-panel" + (showProps ? " expanded" : "")}>
      <div className="pub-header-row">
        <span className="pub-label">{t("pubHeader")}</span>
        {pubHint && pubTopic && <span className="pub-hint">{t("pubFilledNote")}</span>}
      </div>
      <div className="pub-row">
        <input
          className="mono"
          value={pubTopic}
          placeholder={t("pubTopicPh")}
          onChange={(e) => setPubTopic(e.target.value, false)} // C37: manual edit clears the hint
        />
        <select value={qos} onChange={(e) => setQos(+e.target.value)}>
          <option value={0}>QoS 0</option>
          <option value={1}>QoS 1</option>
          <option value={2}>QoS 2</option>
        </select>
        <label className="pub-retain">
          <input type="checkbox" checked={retained} onChange={(e) => setRetained(e.target.checked)} /> retain
        </label>
        <button className="pub-btn" disabled={!canPublish} onClick={publish}>{t("pubBtn")}</button>
      </div>
      <div className="pub-props-toggle-row">
        <button className="props-toggle" disabled={is311} onClick={togglePubProps}>
          {showProps ? "▾" : "▸"} {t("pubProps")}{propCount > 0 ? ` · ${propCount}` : ""}
        </button>
        {is311 && <span className="props-disabled-note">{t("props311")}</span>}
      </div>
      {showProps && (
        <div className="props-section">
          <div className="pub-row">
            <input className="mono" placeholder={t("ctPlaceholder")} value={contentType} onChange={(e) => setContentType(e.target.value)} />
            <input className="mono" placeholder="response topic" value={responseTopic} onChange={(e) => setResponseTopic(e.target.value)} />
          </div>
          {userProps.map((p, i) => (
            <div className="pub-row" key={i}>
              <input className="mono" placeholder="key" value={p.key} onChange={(e) => updProp(i, "key", e.target.value)} />
              <input className="mono" placeholder="value" value={p.value} onChange={(e) => updProp(i, "value", e.target.value)} />
              <button className="prop-remove" onClick={() => setUserProps(userProps.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <button className="prop-add" onClick={() => setUserProps([...userProps, { key: "", value: "" }])}>{t("propAddUser")}</button>
        </div>
      )}
      <textarea className="pub-payload mono" placeholder='{"value": 23.5}' value={payload} onChange={(e) => setPayload(e.target.value)} />
    </div>
  );
}
