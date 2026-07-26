import { useMemo } from "react";
import { useAppStore } from "../store/appStore";
import { findNode, leafCount, topTopics } from "../lib/subtree";
import { applyFocus } from "../bridge/focus";
import { t } from "../lib/i18n";

const TOP_N = 10;

/**
 * Shown instead of a message stream when the selected node covers more topics
 * than the guard allows. Computed entirely from the tree already in the store,
 * so it costs nothing on the bridge — and it answers the question a firehose
 * could not: which topic is actually busy.
 */
export function SubtreeSummary({ topic }: { topic: string }) {
  const tree = useAppStore((s) => s.tree);
  const rate = useAppStore((s) => s.rate);
  const node = useMemo(() => findNode(tree, topic), [tree, topic]);
  const rows = useMemo(() => (node ? topTopics(node, TOP_N) : []), [node]);
  const leaves = useMemo(() => (node ? leafCount(node) : 0), [node]);

  // A reconnect clears the backend tree while a summary may still be open, so
  // the node can genuinely vanish. Fall back to the same empty-state chrome the
  // rest of the pane uses rather than rendering a blank panel.
  if (!node) {
    return (
      <div className="msg-empty">
        <div className="empty-state">
          <span className="empty-icon">←</span>
          <div className="empty-title">{t("msgSelectTitle")}</div>
          <div className="empty-hint">{t("msgSelectHint")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="subtree-summary">
      <div className="ss-head">
        <span className="ss-stat">{t("ssTopics", { n: leaves })}</span>
        <span className="ss-stat mono">{t("ssGlobalRate", { n: rate.global.toFixed(1) })}</span>
      </div>
      <div className="ss-hint">{t("ssHint")}</div>
      <div className="ss-list">
        {rows.map((r) => (
          <button key={r.topic} className="ss-row" onClick={() => void applyFocus(r.topic, true, 1)}>
            <span className="ss-count mono">{r.count}</span>
            <span className="ss-name mono">{r.topic}</span>
            <span className="ss-prev mono">{r.preview}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
