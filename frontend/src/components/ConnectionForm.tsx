import { useEffect, useState } from "react";
import { GetProfiles, SaveProfile, Connect } from "../../wailsjs/go/main/App";
import { config } from "../../wailsjs/go/models";
import { useAppStore } from "../store/appStore";
import { classifyConnectError } from "../lib/connectError";
import { t } from "../lib/i18n";
import { useEscape } from "../lib/useEscape";

// C8: "+ 새 연결" / fresh-entry defaults — host blank, port 1883, tcp, 5.0, autoReconnect true.
const empty = (): config.Profile => config.Profile.createFrom({
  name: "", host: "", port: 1883, transport: "tcp", version: "5.0",
  clientId: "mqtt-insight", username: "", password: "", keepAlive: 60,
  cleanSession: true, autoReconnect: true, caCertPath: "", useSystemCAs: true,
  skipVerify: false, wsPath: "/mqtt", willTopic: "", willPayload: "",
  willQos: 0, willRetained: false,
});

type Tab = "quick" | "advanced";

export function ConnectionForm({ editProfile, onClose, onSaved, onConnected }: {
  editProfile: config.Profile | null; onClose: () => void; onSaved: () => void;
  onConnected?: (p: config.Profile) => void;
}) {
  const [tab, setTab] = useState<Tab>(editProfile ? "advanced" : "quick"); // C9
  const [p, setP] = useState<config.Profile>(() => (editProfile ? config.Profile.createFrom(editProfile) : empty()));
  const [selectedChip, setSelectedChip] = useState<string | null>(editProfile?.name ?? null);
  const [profiles, setProfiles] = useState<config.Profile[]>([]);
  const [connecting, setConnecting] = useState(false);
  const connectError = useAppStore((s) => s.connectError);
  const setConnectError = useAppStore((s) => s.setConnectError);
  const resetSession = useAppStore((s) => s.resetSession);
  const setActiveVersion = useAppStore((s) => s.setActiveVersion);
  const setBroker = useAppStore((s) => s.setBroker);

  const reloadProfiles = () => GetProfiles().then((r) => setProfiles(r || []));
  useEffect(() => { reloadProfiles(); setConnectError(null); }, []);
  useEscape(onClose); // C42/F28

  // F28: Enter in any text input on the active tab submits (connect).
  function onFormKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      void connect();
    }
  }

  // B47: any direct field edit deselects the saved-profile chip.
  const upd = <K extends keyof config.Profile>(k: K, v: config.Profile[K]) => {
    setP((prev) => config.Profile.createFrom({ ...prev, [k]: v }));
    setSelectedChip(null);
  };

  function pickChip(sp: config.Profile) {
    setP(config.Profile.createFrom(sp));
    setSelectedChip(sp.name);
  }
  function newChip() {
    setP(empty());
    setSelectedChip(null);
  }

  async function connect() {
    const finalP = config.Profile.createFrom({ ...p, name: p.name.trim() || p.host }); // C11
    setConnectError(null);
    setConnecting(true);
    try {
      resetSession();
      setActiveVersion(finalP.version);
      setBroker(`${finalP.host}:${finalP.port}`);
      await Connect(finalP);
      await SaveProfile(finalP);
      reloadProfiles();
      onConnected?.(finalP);
      onSaved();
      onClose();
    } catch (e) {
      setBroker("");
      setConnectError(classifyConnectError(String(e), finalP.host));
    } finally {
      setConnecting(false);
    }
  }

  const showTls = p.transport === "tls" || p.transport === "wss";
  const showWs = p.transport === "ws" || p.transport === "wss";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal conn-modal" onClick={(e) => e.stopPropagation()} onKeyDown={onFormKeyDown}>
        <h3>{t("connModalTitle")}</h3>
        <p className="modal-sub">{t("connModalSub")}</p>

        {connectError && (
          <div className="err-banner">⚠ {t(connectError.key, { host: connectError.host ?? "", raw: connectError.raw ?? "" })}</div>
        )}

        {profiles.length > 0 && (
          <div className="chip-section">
            <div className="chip-label">{t("savedProfiles")}</div>
            <div className="chip-hint">{t("loadHint")}</div>
            <div className="chip-row">
              <button className={`chip dashed ${selectedChip === null ? "on" : ""}`} onClick={newChip}>{t("newConn")}</button>
              {profiles.map((sp) => (
                <button key={sp.name} className={`chip ${selectedChip === sp.name ? "on" : ""}`} onClick={() => pickChip(sp)}>
                  <span className="chip-dot" />{sp.name || sp.host}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="divider-label">{t("detailsLabel")}</div>

        <div className="tabs-row">
          <span className="seg">
            <button className={tab === "quick" ? "on" : ""} onClick={() => setTab("quick")}>{t("tabQuick")}</button>
            <button className={tab === "advanced" ? "on" : ""} onClick={() => setTab("advanced")}>{t("tabAdvanced")}</button>
          </span>
        </div>

        {tab === "quick" ? (
          <div className="form-body">
            <label>{t("lblHost")} <input className="mono" placeholder="localhost" value={p.host} onChange={(e) => upd("host", e.target.value)} /></label>
            <label>{t("lblPort")} <input className="mono" type="number" value={p.port} onChange={(e) => upd("port", +e.target.value)} /></label>
            <label>{t("lblTransport")}
              <select value={p.transport} onChange={(e) => upd("transport", e.target.value)}>
                <option value="tcp">TCP</option><option value="tls">TLS</option>
                <option value="ws">WebSocket</option><option value="wss">WebSocket Secure</option>
              </select>
            </label>
            <div className="hint-box">{t("quickHint")}</div>
          </div>
        ) : (
          <div className="form-body advanced">
            <div className="field-group">
              <label>{t("lblProfileName")} <input placeholder={t("profileNamePh")} value={p.name} onChange={(e) => upd("name", e.target.value)} /></label>
              <label>{t("lblVersion")}
                <select value={p.version} onChange={(e) => upd("version", e.target.value)}>
                  <option value="5.0">5.0</option><option value="3.1.1">3.1.1</option>
                </select>
              </label>
            </div>
            <div className="field-group">
              <label>{t("lblHost")} <input className="mono" placeholder="localhost" value={p.host} onChange={(e) => upd("host", e.target.value)} /></label>
              <label>{t("lblPort")} <input className="mono" type="number" value={p.port} onChange={(e) => upd("port", +e.target.value)} /></label>
              <label>{t("lblTransport")}
                <select value={p.transport} onChange={(e) => upd("transport", e.target.value)}>
                  <option value="tcp">TCP</option><option value="tls">TLS</option>
                  <option value="ws">WebSocket</option><option value="wss">WebSocket Secure</option>
                </select>
              </label>
              <label>{t("lblClientId")} <input value={p.clientId} onChange={(e) => upd("clientId", e.target.value)} /></label>
              <label>{t("lblKeepAlive")} <input className="mono" type="number" value={p.keepAlive} onChange={(e) => upd("keepAlive", +e.target.value)} /></label>
              <label className="row-check"><input type="checkbox" checked={p.cleanSession} onChange={(e) => upd("cleanSession", e.target.checked)} /> {t("lblCleanSession")}</label>
              <label className="row-check"><input type="checkbox" checked={p.autoReconnect} onChange={(e) => upd("autoReconnect", e.target.checked)} /> {t("autoReconnect")}</label>
            </div>
            <div className="field-group">
              <label>{t("lblUser")} <input value={p.username} onChange={(e) => upd("username", e.target.value)} /></label>
              <label>{t("lblPass")} <input type="password" value={p.password} onChange={(e) => upd("password", e.target.value)} /></label>
            </div>
            {showTls && (
              <div className="field-group">
                <div className="group-title">{t("lblTlsSection")}</div>
                <label>{t("lblCaCert")} <input value={p.caCertPath} onChange={(e) => upd("caCertPath", e.target.value)} /></label>
                <label className="row-check"><input type="checkbox" checked={p.useSystemCAs} onChange={(e) => upd("useSystemCAs", e.target.checked)} /> {t("lblSystemCa")}</label>
                <label className="row-check"><input type="checkbox" checked={p.skipVerify} onChange={(e) => upd("skipVerify", e.target.checked)} /> {t("lblSkipVerify")}</label>
              </div>
            )}
            {showWs && (
              <div className="field-group">
                <div className="group-title">WS</div>
                <label>{t("lblWsPath")} <input value={p.wsPath} onChange={(e) => upd("wsPath", e.target.value)} /></label>
              </div>
            )}
            <div className="field-group">
              <div className="group-title">{t("lblLwtSection")}</div>
              <label>{t("lblWillTopic")} <input value={p.willTopic} onChange={(e) => upd("willTopic", e.target.value)} /></label>
              <label>{t("lblWillPayload")} <input value={p.willPayload} onChange={(e) => upd("willPayload", e.target.value)} /></label>
              <label>{t("lblWillQos")}
                <select value={p.willQos} onChange={(e) => upd("willQos", +e.target.value)}>
                  <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
                </select>
              </label>
              <label className="row-check"><input type="checkbox" checked={p.willRetained} onChange={(e) => upd("willRetained", e.target.checked)} /> {t("lblWillRetained")}</label>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-connect" disabled={connecting} onClick={connect}>{t("btnConnect")}</button>
          <button className="btn-outline" onClick={onClose}>{t("btnCancel")}</button>
        </div>
      </div>
    </div>
  );
}
