import { useEffect, useState } from "react";
import { initEventBridge } from "./bridge/events";
import { ConnectionBar } from "./components/ConnectionBar";
import { ConnectionForm } from "./components/ConnectionForm";
import { TopicTree } from "./components/TopicTree";
import { MessageList } from "./components/MessageList";
import { PublishPanel } from "./components/PublishPanel";
import "./App.css";

function App() {
  const [showConnect, setShowConnect] = useState(false);
  useEffect(() => initEventBridge(), []);

  return (
    <div className="layout">
      <ConnectionBar onOpenConnect={() => setShowConnect(true)} />
      <div className="panes">
        <div className="pane tree-pane"><TopicTree /></div>
        <div className="right-col">
          <div className="pane msg-pane"><MessageList /></div>
          <div className="pane pub-pane"><PublishPanel /></div>
        </div>
      </div>
      {showConnect && <ConnectionForm onClose={() => setShowConnect(false)} />}
    </div>
  );
}

export default App;
