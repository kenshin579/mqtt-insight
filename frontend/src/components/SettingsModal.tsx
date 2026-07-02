import { useEffect, useState } from "react";
import { GetSettings, SaveSettings } from "../../wailsjs/go/main/App";
import { config } from "../../wailsjs/go/models";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<config.Settings | null>(null);
  useEffect(() => { GetSettings().then(setS); }, []);
  if (!s) return null;

  async function save() {
    await SaveSettings(s!);
    document.documentElement.dataset.theme = s!.theme;
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <label>Theme
          <select value={s.theme} onChange={(e) => setS(config.Settings.createFrom({ ...s, theme: e.target.value }))}>
            <option value="dark">dark</option><option value="light">light</option>
          </select>
        </label>
        <label>Ring buffer size (per topic)
          <input type="number" value={s.ringBufferSize} onChange={(e) => setS(config.Settings.createFrom({ ...s, ringBufferSize: +e.target.value }))} />
        </label>
        <label>Default format
          <select value={s.defaultFormat} onChange={(e) => setS(config.Settings.createFrom({ ...s, defaultFormat: e.target.value }))}>
            <option value="plain">plain</option><option value="json">json</option>
            <option value="hex">hex</option><option value="base64">base64</option>
          </select>
        </label>
        <p className="meta">Ring buffer size applies after restart.</p>
        <div className="modal-actions"><button onClick={save}>Save</button><button onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
