import { useEffect, useMemo, useState } from "react";
import { Tree, NodeApi } from "react-arborist";
import { useAppStore } from "../store/appStore";
import { bytesToString } from "../lib/payload";
import type { TreeNode } from "../types";
import { Subscribe, Unsubscribe, Publish, EnableRecording, DisableRecording, RecordedTopics } from "../../wailsjs/go/main/App";
import { mqtt } from "../../wailsjs/go/models";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface ArboristNode { id: string; name: string; count: number; preview: string; retained: boolean; children?: ArboristNode[]; }

function toArborist(node: TreeNode | undefined): ArboristNode[] {
  if (!node?.children) return [];
  return node.children.map((c) => ({
    id: c.fullTopic,
    name: c.name,
    count: c.messageCount,
    preview: c.lastPayload ? bytesToString(c.lastPayload).slice(0, 40) : "",
    retained: c.retained,
    children: c.children ? toArborist(c) : undefined,
  }));
}

/** Delete a retained message by publishing an empty retained payload. */
function deleteRetained(topic: string) {
  const m = mqtt.Message.createFrom({ topic, qos: 0, retained: true, timestamp: new Date().toISOString() });
  (m as unknown as { payload: string }).payload = ""; // empty base64 -> empty []byte
  return Publish(m);
}

export function TopicTree() {
  const tree = useAppStore((s) => s.tree);
  const selectTopic = useAppStore((s) => s.selectTopic);
  const setPublishTopic = useAppStore((s) => s.setPublishTopic);
  const recording = useAppStore((s) => s.recording);
  const setRecordingTopics = useAppStore((s) => s.setRecordingTopics);
  const toggleRecordingTopic = useAppStore((s) => s.toggleRecordingTopic);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; node: ArboristNode } | null>(null);
  const data = useMemo(() => toArborist(tree ?? undefined), [tree]);

  // Backend owns recording state; initialize the frontend set on mount.
  useEffect(() => {
    RecordedTopics().then((ts) => setRecordingTopics(ts || []));
  }, [setRecordingTopics]);

  function menuItems(n: ArboristNode): MenuItem[] {
    const isRec = recording.has(n.id);
    const items: MenuItem[] = [
      { label: "이 토픽에 발행", onClick: () => setPublishTopic(n.id) },
      { label: "Unsubscribe", onClick: () => Unsubscribe(n.id) },
    ];
    if (n.retained) {
      items.push({ label: "Retained 삭제", onClick: () => deleteRetained(n.id) });
    }
    items.push({
      label: isRec ? "기록 끄기" : "기록 켜기",
      onClick: () => {
        if (isRec) DisableRecording(n.id);
        else EnableRecording(n.id);
        toggleRecordingTopic(n.id);
      },
    });
    return items;
  }

  return (
    <div className="topic-tree">
      <div className="tree-toolbar">
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button title="Subscribe to #" onClick={() => Subscribe("#", 0)}>Sub #</button>
      </div>
      <Tree
        data={data}
        searchTerm={filter}
        openByDefault={false}
        width="100%"
        height={600}
        rowHeight={26}
        onSelect={(nodes: NodeApi<ArboristNode>[]) => nodes[0] && selectTopic(nodes[0].id)}
      >
        {({ node, style, dragHandle }) => (
          <div
            style={style}
            ref={dragHandle}
            className="tree-row"
            onClick={() => node.toggle()}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, node: node.data });
            }}
          >
            {recording.has(node.data.id) && <span className="rec-dot" title="recording">●</span>}
            <span className="tree-name">{node.data.name}</span>
            {node.data.count > 0 && <span className="tree-count">{node.data.count}</span>}
            {node.data.preview && <span className="tree-preview">{node.data.preview}</span>}
          </div>
        )}
      </Tree>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />}
    </div>
  );
}
