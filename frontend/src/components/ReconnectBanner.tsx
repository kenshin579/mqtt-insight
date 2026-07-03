import { useAppStore } from "../store/appStore";

// Stub — replaced by the full reconnecting/dropped banner in Task 13.
export function ReconnectBanner({ onReconnect }: { onReconnect: () => void }) {
  const status = useAppStore((s) => s.status);
  if (status !== "reconnecting") return null;
  return (
    <div className="banner banner-warn">
      <span>Reconnecting…</span>
      <button onClick={onReconnect}>Retry now</button>
    </div>
  );
}
