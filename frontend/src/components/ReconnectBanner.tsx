import { useAppStore } from "../store/appStore";
import { t } from "../lib/i18n";
import { Disconnect } from "../../wailsjs/go/main/App";

// Reconnecting (yellow, A9) / dropped (red, A10) banner below the connection bar (C15~C18).
export function ReconnectBanner({ onReconnect }: { onReconnect: () => void }) {
  const status = useAppStore((s) => s.status);
  const attempt = useAppStore((s) => s.attempt);
  const broker = useAppStore((s) => s.broker);
  if (status === "reconnecting") {
    return (
      <div className="banner banner-warn">
        <span className="spinner sm" />
        <span>{attempt > 0 ? t("reconnMsg", { n: attempt }) : t("retrying")}</span>
        <span className="spacer" />
        <button className="btn-warn-outline" onClick={onReconnect}>{t("retryNow")}</button>
        <button className="btn-outline" onClick={() => Disconnect()}>{t("stopRetry")}</button>
      </div>
    );
  }
  if (status === "disconnected" && broker !== "") {
    return (
      <div className="banner banner-err">
        <span>⚠</span><span>{t("droppedMsg")}</span>
        <span className="spacer" />
        <button className="btn-err" onClick={onReconnect}>{t("reconnectBtn")}</button>
      </div>
    );
  }
  return null;
}
