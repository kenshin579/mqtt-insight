import { t } from "../lib/i18n";
import { CancelConnect } from "../../wailsjs/go/main/App";

// Full-screen dim + card + cancel while status === "connecting" (A8, B60, C13).
export function ConnectingOverlay() {
  return (
    <div className="connecting-overlay">
      <div className="connecting-card">
        <span className="spinner" />
        <span>{t("connecting")}</span>
        <button className="btn-outline" onClick={() => CancelConnect()}>{t("btnCancel")}</button>
      </div>
    </div>
  );
}
