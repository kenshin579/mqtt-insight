import { useEffect, useState } from "react";
import { SaveSettings, GetVersion } from "../../wailsjs/go/main/App";
import { config } from "../../wailsjs/go/models";
import { useAppStore, type SettingsState, type Fmt } from "../store/appStore";
import { setLang, t, type Lang } from "../lib/i18n";
import { applyTheme } from "../lib/theme";
import { SegmentedControl } from "./SegmentedControl";
import { useEscape } from "../lib/useEscape";

// A5/B53-B57: settings modal — every field applies immediately (C38).
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setFmt = useAppStore((s) => s.setFmt);
  const treeHintDismissed = useAppStore((s) => s.treeHintDismissed);
  const recToastShown = useAppStore((s) => s.recToastShown);
  const [version, setVersion] = useState("");

  useEscape(onClose); // C42/F28

  useEffect(() => { GetVersion().then(setVersion); }, []);

  // Applies a settings patch: store + persisted backend Settings (C38) + side effects.
  function patch(next: Partial<SettingsState>) {
    const merged = { ...settings, ...next };
    setSettings(next);
    const full = config.Settings.createFrom({
      theme: merged.theme,
      ringBufferSize: merged.ringBufferSize,
      defaultFormat: merged.defaultFormat,
      lang: merged.lang,
      timestampFormat: merged.timestampFormat,
      messageOrder: merged.messageOrder,
      treeHintDismissed,
      recToastShown,
    });
    void SaveSettings(full);
    if (next.lang) setLang(next.lang);
    if (next.theme) applyTheme(next.theme);
    if (next.defaultFormat) setFmt(next.defaultFormat); // F7: open detail switches immediately
    // ringBufferSize applies backend-side via SetCapacity inside SaveSettings (G7/C39).
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-gear">⚙</span>
          <h3>{t("setTitle")}</h3>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <div className="sec-header">{t("secGeneral")}</div>

          <div className="setting-field">
            <div className="setting-field-title">{t("setLanguage")}</div>
            <SegmentedControl<Lang>
              options={[{ value: "ko", label: "한국어" }, { value: "en", label: "English" }]}
              value={settings.lang}
              onChange={(v) => patch({ lang: v })}
            />
          </div>

          <div className="setting-field tight">
            <div className="setting-field-title">{t("setTheme")}</div>
            <SegmentedControl<SettingsState["theme"]>
              options={[
                { value: "dark", label: t("themeDark") },
                { value: "light", label: t("themeLight") },
                { value: "system", label: t("themeSystem") },
              ]}
              value={settings.theme}
              onChange={(v) => patch({ theme: v })}
            />
          </div>

          <div className="sec-header">{t("secMessages")}</div>

          <div className="setting-field">
            <div className="setting-field-title with-hint">{t("setDefaultFmt")}</div>
            <div className="setting-hint">{t("setDefaultFmtHint")}</div>
            <SegmentedControl<Fmt>
              options={[
                { value: "json", label: "JSON" },
                { value: "plain", label: "Plain" },
                { value: "hex", label: "Hex" },
                { value: "base64", label: "Base64" },
              ]}
              value={settings.defaultFormat}
              onChange={(v) => patch({ defaultFormat: v })}
            />
          </div>

          <div className="setting-field">
            <div className="setting-field-title with-hint">{t("setTsFormat")}</div>
            <div className="setting-hint">{t("setTsHint")}</div>
            <SegmentedControl<SettingsState["timestampFormat"]>
              options={[
                { value: "absolute", label: t("tsAbsolute") },
                { value: "relative", label: t("tsRelative") },
              ]}
              value={settings.timestampFormat}
              onChange={(v) => patch({ timestampFormat: v })}
            />
          </div>

          <div className="setting-field tight">
            <div className="setting-field-title">{t("setSort")}</div>
            <SegmentedControl<SettingsState["messageOrder"]>
              options={[
                { value: "newest", label: t("sortNew") },
                { value: "oldest", label: t("sortOld") },
              ]}
              value={settings.messageOrder}
              onChange={(v) => patch({ messageOrder: v })}
            />
          </div>

          <div className="sec-header">{t("secData")}</div>

          <div className="setting-field tight">
            <div className="setting-buffer-row">
              <span>{t("setBuffer")}</span>
              <span className="setting-value mono">{settings.ringBufferSize}</span>
            </div>
            <div className="setting-hint">{t("setBufferHint")}</div>
            <input
              className="buffer-slider"
              type="range" min={50} max={500} step={10}
              value={settings.ringBufferSize}
              onChange={(e) => patch({ ringBufferSize: +e.target.value })}
            />
          </div>
        </div>

        <div className="settings-footer">
          <div className="settings-version">mqtt-insight {version}</div>
          <button className="btn-accent full" onClick={onClose}>{t("setDone")}</button>
        </div>
      </div>
    </div>
  );
}
