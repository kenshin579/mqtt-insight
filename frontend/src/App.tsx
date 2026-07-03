import { useEffect, useState } from "react";
import { initEventBridge } from "./bridge/events";
import { useAppStore } from "./store/appStore";
import { GetProfiles, GetSettings, RecordedTopics } from "../wailsjs/go/main/App";
import { config } from "../wailsjs/go/models";
import { setLang } from "./lib/i18n";
import { Welcome } from "./components/Welcome";
import { ConnectionHome } from "./components/ConnectionHome";
import { ConnectionBar } from "./components/ConnectionBar";
import { ConnectionForm } from "./components/ConnectionForm";
import { SettingsModal } from "./components/SettingsModal";
import { ConnectingOverlay } from "./components/ConnectingOverlay";
import { ReconnectBanner } from "./components/ReconnectBanner";
import { TopicTree } from "./components/TopicTree";
import { MessageList } from "./components/MessageList";
import { PublishPanel } from "./components/PublishPanel";
import "./lib/tokens.css";
import "./App.css";

export function applyTheme(theme: string) {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : theme;
  document.documentElement.dataset.theme = resolved;
}

function App() {
  const status = useAppStore((s) => s.status);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setRecordingTopics = useAppStore((s) => s.setRecordingTopics);
  const [profiles, setProfiles] = useState<config.Profile[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [editProfile, setEditProfile] = useState<config.Profile | null>(null); // C9: 편집 진입
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false); // F6

  const reloadProfiles = () => GetProfiles().then((p) => setProfiles(p || []));

  useEffect(() => {
    const cleanup = initEventBridge();
    reloadProfiles();
    RecordedTopics().then((ts) => setRecordingTopics(ts || []));
    GetSettings().then((s) => {
      setSettings(s as Partial<import("./store/appStore").SettingsState>);
      setLang((s.lang as "ko" | "en") || "ko");
      applyTheme(s.theme || "dark");
    });
    return cleanup;
  }, []);

  // system theme live listener (C38)
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const fn = () => applyTheme("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [settings.theme]);

  const connected = status === "connected" || status === "reconnecting";
  const inApp = connected || (status === "disconnected" && useAppStore.getState().tree !== null && useAppStore.getState().broker !== "");
  // view 파생: 연결됨(또는 앱 진입 후 끊김) → app / 미연결 && 프로필>0 → home / 그 외 welcome
  const view = inApp ? "app" : profiles.length > 0 ? "home" : "welcome";

  const openConnect = (edit?: config.Profile) => { setEditProfile(edit ?? null); setShowConnect(true); };

  return (
    <div className="layout">
      <div className="titlebar">{/* A11: 점 3개·아이콘·앱명·spacer·?·⚙ — CSS는 레지스트리 A11/B1/B2 */}
        <span className="tl-dots"><i /><i /><i /></span>
        <span className="app-icon">◈</span>
        <span className="app-name">MQTT Insight</span>
        <span className="spacer" />
        <button className="tb-btn" title="시작 가이드 다시 보기" onClick={() => setShowGuide(true)}>?</button>
        <button className="tb-btn" title="설정" onClick={() => setShowSettings(true)}>⚙</button>
      </div>
      <ConnectionBar onOpenConnect={() => openConnect()} />
      <ReconnectBanner onReconnect={() => openConnect()} />
      {view === "welcome" && <Welcome onConnect={() => openConnect()} />}
      {view === "home" && (
        <ConnectionHome profiles={profiles} onNew={() => openConnect()} onEdit={(p) => openConnect(p)} onProfilesChanged={reloadProfiles} />
      )}
      {view === "app" && (
        <div className="panes">
          <div className="pane tree-pane"><TopicTree /></div>
          <div className="right-col">
            <div className="pane msg-pane"><MessageList /></div>
            <div className="pane pub-pane"><PublishPanel /></div>
          </div>
        </div>
      )}
      {showGuide && view !== "welcome" && (
        <div className="guide-overlay"><Welcome onConnect={() => { setShowGuide(false); openConnect(); }} onClose={() => setShowGuide(false)} /></div>
      )}
      {showConnect && (
        <ConnectionForm editProfile={editProfile} onClose={() => setShowConnect(false)} onSaved={reloadProfiles} />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {status === "connecting" && <ConnectingOverlay />}
    </div>
  );
}
export default App;
