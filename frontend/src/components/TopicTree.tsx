import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, NodeApi } from "react-arborist";
import { useAppStore } from "../store/appStore";
import { bytesToString } from "../lib/payload";
import { matchesAny, type Sub } from "../lib/mqttMatch";
import { t } from "../lib/i18n";
import type { TreeNode, Message } from "../types";
import { EnableRecording, DisableRecording, Publish, SaveSettings } from "../../wailsjs/go/main/App";
import { mqtt, config } from "../../wailsjs/go/models";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { SubscriptionChips, TreeEmptyState } from "./SubscriptionChips";
import { Toast } from "./Toast";

interface ArboristNode {
  id: string;
  name: string;
  isLeaf: boolean;
  count: number; // leaf = own messageCount; branch = recursive sum of descendant leaf counts (F5)
  retained: boolean;
  preview: string; // leaf only, 34 chars
  dim: boolean; // leaf: unsubscribed; branch: every descendant leaf dim
  children?: ArboristNode[];
}

/** Delete a retained message by publishing an empty retained payload (G9). */
function deleteRetained(topic: string) {
  const m = mqtt.Message.createFrom({ topic, qos: 0, retained: true, timestamp: new Date().toISOString() });
  (m as unknown as { payload: string }).payload = ""; // empty base64 -> empty []byte
  return Publish(m);
}

/** F21: case-insensitive substring match over the full topic path of leaves; keeps matching ancestors. */
function filterNode(node: TreeNode, q: string): TreeNode | null {
  if (!node.children || node.children.length === 0) {
    return node.fullTopic.toLowerCase().includes(q) ? node : null;
  }
  const kept: TreeNode[] = [];
  for (const c of node.children) {
    const f = filterNode(c, q);
    if (f) kept.push(f);
  }
  return kept.length ? { ...node, children: kept } : null;
}

function applyFilter(tree: TreeNode | null, filter: string): TreeNode | null {
  const q = filter.trim().toLowerCase();
  if (!q) return tree;
  if (!tree?.children?.length) return null;
  const kept: TreeNode[] = [];
  for (const c of tree.children) {
    const f = filterNode(c, q);
    if (f) kept.push(f);
  }
  return kept.length ? { ...tree, children: kept } : null;
}

function toArborist(node: TreeNode, subs: Sub[]): ArboristNode {
  const isLeaf = !node.children || node.children.length === 0;
  if (isLeaf) {
    return {
      id: node.fullTopic,
      name: node.name,
      isLeaf: true,
      count: node.messageCount,
      retained: node.retained,
      preview: node.lastPayload ? bytesToString(node.lastPayload).slice(0, 34) : "",
      dim: !matchesAny(node.fullTopic, subs),
    };
  }
  const children = [...node.children!]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => toArborist(c, subs));
  return {
    id: node.fullTopic,
    name: node.name,
    isLeaf: false,
    count: children.reduce((s, c) => s + c.count, 0), // recursive sum
    retained: node.retained,
    preview: "",
    dim: children.every((c) => c.dim),
    children,
  };
}

function leafCountOf(node: TreeNode | null): number {
  if (!node?.children?.length) return 0;
  const count = (n: TreeNode): number => (!n.children || n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + count(c), 0));
  return node.children.reduce((s, c) => s + count(c), 0);
}

export function TopicTree() {
  const tree = useAppStore((s) => s.tree);
  const subs = useAppStore((s) => s.subs);
  const liveMessages = useAppStore((s) => s.liveMessages);
  const selectedTopic = useAppStore((s) => s.selectedTopic);
  const selectTopic = useAppStore((s) => s.selectTopic);
  const setPubTopic = useAppStore((s) => s.setPubTopic);
  const recording = useAppStore((s) => s.recording);
  const toggleRecordingTopic = useAppStore((s) => s.toggleRecordingTopic);
  const treeHintDismissed = useAppStore((s) => s.treeHintDismissed);
  const dismissTreeHint = useAppStore((s) => s.dismissTreeHint);
  const recToastShown = useAppStore((s) => s.recToastShown);
  const markRecToastShown = useAppStore((s) => s.markRecToastShown);
  const settings = useAppStore((s) => s.settings);

  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; node: ArboristNode } | null>(null);
  const [showToast, setShowToast] = useState(false);

  const areaRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const leafCount = useMemo(() => leafCountOf(tree), [tree]);
  const data = useMemo(() => {
    const filtered = applyFilter(tree, filter);
    if (!filtered?.children?.length) return [];
    return [...filtered.children].sort((a, b) => a.name.localeCompare(b.name)).map((c) => toArborist(c, subs));
  }, [tree, filter, subs]);

  // Persist treeHintDismissed/recToastShown alongside the rest of the current settings (C25/A7).
  function persistFlags(overrides: Partial<{ treeHintDismissed: boolean; recToastShown: boolean }>) {
    const s = config.Settings.createFrom({
      theme: settings.theme,
      ringBufferSize: settings.ringBufferSize,
      defaultFormat: settings.defaultFormat,
      lang: settings.lang,
      timestampFormat: settings.timestampFormat,
      messageOrder: settings.messageOrder,
      treeHintDismissed,
      recToastShown,
      ...overrides,
    });
    return SaveSettings(s);
  }

  function handleDismissHint() {
    dismissTreeHint();
    void persistFlags({ treeHintDismissed: true });
  }

  function handleRowClick(node: NodeApi<ArboristNode>) {
    if (!node.data.isLeaf) node.toggle();
    const id = node.data.id;
    let latest: Message | null = null;
    for (let i = liveMessages.length - 1; i >= 0; i--) {
      if (liveMessages[i].topic === id) { latest = liveMessages[i]; break; }
    }
    selectTopic(id, latest);
  }

  function buildMenuItems(n: ArboristNode): MenuItem[] {
    const items: MenuItem[] = [{ label: t("menuPublish"), onClick: () => setPubTopic(n.id, true) }];
    if (n.isLeaf) {
      const isRec = recording.has(n.id);
      items.push({
        label: isRec ? t("menuRecOff") : t("menuRecOn"),
        onClick: () => {
          if (isRec) {
            void DisableRecording(n.id);
            toggleRecordingTopic(n.id);
          } else {
            void EnableRecording(n.id);
            toggleRecordingTopic(n.id);
            if (!recToastShown) {
              setShowToast(true);
              markRecToastShown();
              void persistFlags({ recToastShown: true });
            }
          }
        },
      });
      if (n.retained) {
        items.push({ label: t("menuDelRetained"), onClick: () => deleteRetained(n.id) });
      }
    }
    return items;
  }

  const showEmptyState = subs.length === 0 && (!tree || !tree.children?.length);

  return (
    <div className="topic-tree">
      <div className="tt-filter-row">
        <div className="tt-filter-wrap">
          <span className="tt-filter-glyph">⌕</span>
          <input
            className="tt-filter-input mono"
            placeholder={t("filterPh")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <SubscriptionChips />

      <div className="tt-header">{t("treeHeader")} · {leafCount}</div>

      {subs.length > 0 && !treeHintDismissed && (
        <div className="tree-hint">
          <span className="tree-hint-icon">⋯</span>
          <span className="tree-hint-text">{t("treeHintMsg")}</span>
          <button className="tree-hint-x" onClick={handleDismissHint}>✕</button>
        </div>
      )}

      <div className="tree-area" ref={areaRef}>
        {showEmptyState ? (
          <TreeEmptyState />
        ) : (
          <Tree
            data={data}
            openByDefault={true}
            width="100%"
            height={height || 400}
            rowHeight={26}
          >
            {({ node, style, dragHandle }) => {
              const d = node.data;
              const isRec = recording.has(d.id);
              const selected = selectedTopic === d.id;
              const rowClass = ["tt-row", selected && "sel", d.dim && "dim"].filter(Boolean).join(" ");
              return (
                <div
                  ref={dragHandle}
                  style={{ ...style, paddingLeft: 8 + node.level * 15 }}
                  className={rowClass}
                  onClick={() => handleRowClick(node)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, node: d });
                  }}
                >
                  <span className="tt-caret">{d.isLeaf ? "" : node.isOpen ? "▾" : "▸"}</span>
                  {isRec && <span className="tt-recdot">●</span>}
                  <span className={"tt-name " + (d.isLeaf ? "leaf" : "branch")}>{d.name}</span>
                  {d.count > 0 && <span className="tt-count">{d.count}</span>}
                  {d.retained && <span className="tt-retained" title={t("retainedTip")}>R</span>}
                  {d.isLeaf && d.preview && <span className="tt-preview">{d.preview}</span>}
                  <button
                    className="tt-menu-btn"
                    title={t("rowMenuTitle")}
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu({ x: r.left, y: r.bottom + 4, node: d });
                    }}
                  >
                    ⋯
                  </button>
                </div>
              );
            }}
          </Tree>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenuItems(menu.node)} onClose={() => setMenu(null)} />}
      {showToast && <Toast onDone={() => setShowToast(false)}>{t("recToastMsg")}</Toast>}
    </div>
  );
}
