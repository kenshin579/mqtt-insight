import { useEffect, useState } from "react";
import { GetProfiles, SaveProfile, Connect } from "../../wailsjs/go/main/App";
import { config } from "../../wailsjs/go/models";
import { useAppStore } from "../store/appStore";

const empty = {
  name: "", host: "localhost", port: 1883, transport: "tcp", version: "5.0",
  clientId: "mqtt-insight", username: "", password: "", keepAlive: 60,
  cleanSession: true, autoReconnect: true, caCertPath: "", useSystemCAs: true,
  skipVerify: false, wsPath: "/mqtt", willTopic: "", willPayload: "",
  willQos: 0, willRetained: false,
};

export function ConnectionForm({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<config.Profile[]>([]);
  const [p, setP] = useState<config.Profile>(config.Profile.createFrom(empty));
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => { GetProfiles().then((r) => setProfiles(r || [])); }, []);

  const upd = (k: keyof config.Profile, v: unknown) =>
    setP(config.Profile.createFrom({ ...p, [k]: v }));

  async function connect() {
    await SaveProfile(p);
    setStatus("connecting", "connecting…");
    try {
      await Connect(p);
      onClose();
    } catch (e) {
      setStatus("disconnected", String(e));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Connect to Broker</h3>
        <div className="saved">
          {profiles.map((sp) => (
            <button key={sp.name} onClick={() => setP(config.Profile.createFrom(sp))}>{sp.name || sp.host}</button>
          ))}
        </div>
        <label>Name <input value={p.name} onChange={(e) => upd("name", e.target.value)} /></label>
        <label>Host <input value={p.host} onChange={(e) => upd("host", e.target.value)} /></label>
        <label>Port <input type="number" value={p.port} onChange={(e) => upd("port", +e.target.value)} /></label>
        <label>Transport
          <select value={p.transport} onChange={(e) => upd("transport", e.target.value)}>
            <option value="tcp">tcp</option><option value="tls">tls</option>
            <option value="ws">ws</option><option value="wss">wss</option>
          </select>
        </label>
        <label>Version
          <select value={p.version} onChange={(e) => upd("version", e.target.value)}>
            <option value="5.0">5.0</option><option value="3.1.1">3.1.1</option>
          </select>
        </label>
        <label>Client ID <input value={p.clientId} onChange={(e) => upd("clientId", e.target.value)} /></label>
        <label>Username <input value={p.username} onChange={(e) => upd("username", e.target.value)} /></label>
        <label>Password <input type="password" value={p.password} onChange={(e) => upd("password", e.target.value)} /></label>
        {(p.transport === "tls" || p.transport === "wss") && (
          <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={p.skipVerify} onChange={(e) => upd("skipVerify", e.target.checked)} /> Skip TLS verification (dev)
          </label>
        )}
        <div className="modal-actions">
          <button onClick={connect}>Connect</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
