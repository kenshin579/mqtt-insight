import { useAppStore } from "../store/appStore";
import { Disconnect } from "../../wailsjs/go/main/App";
import { t } from "../lib/i18n";

// A11: status dot + halo (4 states) + broker label + connect/disconnect button.
export function ConnectionBar({ onOpenConnect }: { onOpenConnect: () => void }) {
  const status = useAppStore((s) => s.status);
  const broker = useAppStore((s) => s.broker);
  const st = useAppStore.getState();
  const label = { connected: "statusConnected", connecting: "statusConnecting", reconnecting: "statusReconnecting", disconnected: "statusDisconnected" }[status];

  async function disconnect() { // C4: manual disconnect = clear data + return to Home
    await Disconnect();
    st.resetSession();
    st.setBroker("");
    st.setStatus("disconnected");
  }

  return (
    <div className="conn-bar">
      <span className={`dot ${status}`} />
      <span className="status-label">{t(label)}</span>
      <span className="broker mono">{broker}</span>
      <span className="spacer" />
      {status === "connected" && <button className="btn-outline" onClick={disconnect}>{t("btnDisconnect")}</button>}
      {status === "disconnected" && <button className="btn-accent" onClick={onOpenConnect}>{t("btnConnectShort")}</button>}
      {/* connecting/reconnecting: no button (A11) */}
    </div>
  );
}
