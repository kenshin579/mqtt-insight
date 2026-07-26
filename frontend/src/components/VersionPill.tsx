import { useState } from "react";
import { ApplyUpdate } from "../../wailsjs/go/main/App";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { useAppStore } from "../store/appStore";
import { pillState } from "../lib/pillState";
import { t } from "../lib/i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";

/**
 * The build version in the titlebar, which doubles as the update affordance.
 *
 * Clicking never applies the update directly. This sits next to the ? and gear
 * buttons, and applying downloads and then restarts the app — a mis-click would
 * throw away whatever live session the user was watching. It opens a popover
 * and lets them choose.
 */
export function VersionPill() {
  const version = useAppStore((s) => s.version);
  const updateInfo = useAppStore((s) => s.updateInfo);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const updateError = useAppStore((s) => s.updateError);
  const setUpdateError = useAppStore((s) => s.setUpdateError);
  const setUpdateProgress = useAppStore((s) => s.setUpdateProgress);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const st = pillState(version, updateInfo, updateProgress, updateError);

  if (st.kind === "hidden") return null;
  if (st.kind === "plain") return <span className="version-pill">{st.text}</span>;
  if (st.kind === "progress") {
    return <span className="version-pill busy">{t("updDownloading", { pct: st.pct })}</span>;
  }

  const items: MenuItem[] = [];
  if (st.kind === "available" && st.canSelfUpdate) {
    items.push({
      label: t("updRestart"),
      // Clear any earlier failure first, so a retry does not start out looking
      // like it already failed. Then move to 0% immediately rather than waiting
      // for the first update:progress event — the download takes a second or two
      // to start reporting, and until then the pill would still read as an
      // un-started update, so the click looks like it did nothing.

      onClick: () => { setUpdateError(null); setUpdateProgress(0); void ApplyUpdate(); },
    });
  }
  items.push({ label: t("updOpenRelease"), onClick: () => BrowserOpenURL(st.releaseURL) });

  function openMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4 });
  }

  return (
    <>
      {st.kind === "available" ? (
        // The title carries the full text for the case where a narrow window
        // ellipsises the pill.
        <button className="version-pill update" onClick={openMenu} title={t("updAvailable", { v: st.to })}>
          {st.from} → {st.to}
        </button>
      ) : (
        <button className="version-pill failed" onClick={openMenu} title={t("updError", { msg: st.message })}>
          {t("updFailedShort")} ⚠
        </button>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </>
  );
}
