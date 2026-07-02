import { useAppStore } from "../store/appStore";
import { Disconnect } from "../../wailsjs/go/main/App";

export function ConnectionBar({ onOpenConnect, onOpenSettings }: { onOpenConnect: () => void; onOpenSettings?: () => void }) {
  const { status, statusText } = useAppStore();
  return (
    <div className="conn-bar">
      <span className={`dot ${status}`} />
      <span className="conn-text">{status === "connected" ? "Connected" : statusText || "Disconnected"}</span>
      {status === "connected" ? (
        <button onClick={() => Disconnect()}>Disconnect</button>
      ) : (
        <button onClick={onOpenConnect}>Connect…</button>
      )}
      {onOpenSettings && <button onClick={onOpenSettings} title="Settings">⚙</button>}
    </div>
  );
}
