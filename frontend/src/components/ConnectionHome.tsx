import { useEffect, useState } from "react";
import { config } from "../../wailsjs/go/models";
import { Connect, DeleteProfile } from "../../wailsjs/go/main/App";
import { useAppStore } from "../store/appStore";
import { classifyConnectError } from "../lib/connectError";
import { Logo } from "./Logo";
import { t } from "../lib/i18n";

// Saved-profile launcher (A2): left list + right detail/connect.
export function ConnectionHome({ profiles, onNew, onEdit, onProfilesChanged, onConnected }: {
  profiles: config.Profile[]; onNew: () => void; onEdit: (p: config.Profile) => void; onProfilesChanged: () => void;
  onConnected?: (p: config.Profile) => void;
}) {
  const [selected, setSelected] = useState<string>(profiles[0]?.name ?? "");
  const connectError = useAppStore((s) => s.connectError);
  const setConnectError = useAppStore((s) => s.setConnectError);
  const st = useAppStore.getState();
  useEffect(() => { if (!profiles.find((p) => p.name === selected)) setSelected(profiles[0]?.name ?? ""); }, [profiles]);
  const sel = profiles.find((p) => p.name === selected) ?? null;

  async function connect(p: config.Profile) {
    setConnectError(null);
    st.resetSession();
    st.setActiveVersion(p.version);
    st.setBroker(`${p.host}:${p.port}`);
    try {
      await Connect(p);
      onConnected?.(p);
    } catch (e) {
      st.setBroker("");
      setConnectError(classifyConnectError(String(e), p.host));
    }
  }
  async function del(p: config.Profile) {
    if (!window.confirm(t("deleteConfirm", { name: p.name || p.host }))) return; // F27
    await DeleteProfile(p.name);
    onProfilesChanged();
  }

  return (
    <div className="home">
      <div className="home-left">
        <div className="home-header">{t("homeTitle")} · {profiles.length}</div>
        <div className="home-list">
          {profiles.map((p) => (
            <div key={p.name} className={`profile-card ${p.name === selected ? "sel" : ""}`}
              onClick={() => { setSelected(p.name); setConnectError(null); }}
              onDoubleClick={() => connect(p)}>
              <span className="pdot" />
              <div className="pmain"><div className="pname">{p.name || p.host}</div>
                <div className="phost">{p.host}:{p.port}</div></div>
              <span className="pbadge">{p.transport.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <button className="new-conn" onClick={onNew}>{t("homeNew")}</button>
      </div>
      <div className="home-right">
        {sel ? (
          <div className="home-detail">
            <div className="app-icon lg"><Logo size={52} /></div>
            <h2>{sel.name || sel.host}</h2>
            <div className="conn-str">{sel.transport}://{sel.host}:{sel.port}</div>
            <div className="info-cards">
              <div className="info-card"><span>{t("lblTransport")}</span><b>{sel.transport.toUpperCase()}</b></div>
              <div className="info-card"><span>{t("lblPort")}</span><b className="mono">{sel.port}</b></div>
            </div>
            <button className="big-connect" onClick={() => connect(sel)}>{t("homeConnect")}</button>
            {connectError && (
              <div className="err-banner">⚠ {t(connectError.key, { host: connectError.host ?? "", raw: connectError.raw ?? "" })}</div>
            )}
            <div className="home-actions">
              <button className="btn-outline" onClick={() => onEdit(sel)}>{t("homeEdit")}</button>
              <button className="btn-outline danger" onClick={() => del(sel)}>{t("homeDelete")}</button>
            </div>
          </div>
        ) : (
          <div className="empty-state"><span className="empty-icon">←</span>
            <div className="empty-title">{t("homeSelectTitle")}</div>
            <div className="empty-hint">{t("homeSelectHint")}</div></div>
        )}
      </div>
    </div>
  );
}
