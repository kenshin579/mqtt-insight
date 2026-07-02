import { useMemo, useState } from "react";
import { Tree, NodeApi } from "react-arborist";
import { useAppStore } from "../store/appStore";
import { bytesToString } from "../lib/payload";
import type { TreeNode } from "../types";
import { Subscribe, EnableRecording, DisableRecording } from "../../wailsjs/go/main/App";

interface ArboristNode { id: string; name: string; count: number; preview: string; children?: ArboristNode[]; }

function toArborist(node: TreeNode | undefined): ArboristNode[] {
  if (!node?.children) return [];
  return node.children.map((c) => ({
    id: c.fullTopic,
    name: c.name,
    count: c.messageCount,
    preview: c.lastPayload ? bytesToString(c.lastPayload).slice(0, 40) : "",
    children: c.children ? toArborist(c) : undefined,
  }));
}

export function TopicTree() {
  const tree = useAppStore((s) => s.tree);
  const selectTopic = useAppStore((s) => s.selectTopic);
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState<Set<string>>(new Set());
  const data = useMemo(() => toArborist(tree ?? undefined), [tree]);

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
              const id = node.data.id;
              setRecording((prev) => {
                const next = new Set(prev);
                if (next.has(id)) { next.delete(id); DisableRecording(id); }
                else { next.add(id); EnableRecording(id); }
                return next;
              });
            }}
          >
            {recording.has(node.data.id) && <span className="rec-dot" title="recording">●</span>}
            <span className="tree-name">{node.data.name}</span>
            {node.data.count > 0 && <span className="tree-count">{node.data.count}</span>}
            {node.data.preview && <span className="tree-preview">{node.data.preview}</span>}
          </div>
        )}
      </Tree>
    </div>
  );
}
