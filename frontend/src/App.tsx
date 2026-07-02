import { useEffect, useState } from "react";
import { initEventBridge } from "./bridge/events";
import { ConnectionBar } from "./components/ConnectionBar";
import { ConnectionForm } from "./components/ConnectionForm";
import { SettingsModal } from "./components/SettingsModal";
import { TopicTree } from "./components/TopicTree";
import { MessageList } from "./components/MessageList";
import { PublishPanel } from "./components/PublishPanel";
import { GetSettings } from "../wailsjs/go/main/App";
import "./App.css";

function App() {
  const [showConnect, setShowConnect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => initEventBridge(), []);
  useEffect(() => {
    GetSettings().then((s) => { document.documentElement.dataset.theme = s.theme; });
  }, []);

  return (
    <div className="layout">
      <ConnectionBar onOpenConnect={() => setShowConnect(true)} onOpenSettings={() => setShowSettings(true)} />
      <div className="panes">
        <div className="pane tree-pane"><TopicTree /></div>
        <div className="right-col">
          <div className="pane msg-pane"><MessageList /></div>
          <div className="pane pub-pane"><PublishPanel /></div>
        </div>
      </div>
      {showConnect && <ConnectionForm onClose={() => setShowConnect(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
