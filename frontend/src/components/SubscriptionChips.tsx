import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { Subscribe, Unsubscribe } from "../../wailsjs/go/main/App";
import { t } from "../lib/i18n";

export function SubscriptionChips() {
  const subs = useAppStore((s) => s.subs);
  const addSub = useAppStore((s) => s.addSub);
  const removeSub = useAppStore((s) => s.removeSub);
  const [adding, setAdding] = useState(false);
  const [pattern, setPattern] = useState("");
  const [qos, setQos] = useState(0);

  async function add() {
    if (addSub(pattern, qos)) await Subscribe(pattern.trim(), qos);
    setPattern(""); setQos(0); // C19: 중복이어도 입력 클리어
  }
  async function remove(p: string) { removeSub(p); await Unsubscribe(p); }

  return (
    <div className="sub-chips">
      <span className="sub-label">{t("subsLabel")}</span>
      {subs.map((s) => (
        <span className="chip" key={s.pattern}>
          {s.pattern}{s.qos !== 0 ? ` · q${s.qos}` : ""}
          <button className="chip-x" title={t("unsubTitle")} onClick={() => remove(s.pattern)}>✕</button>
        </span>
      ))}
      <button className="chip add" onClick={() => setAdding(!adding)}>{t("addSub")}</button>
      {adding && (
        <div className="add-sub-row">
          <input className="mono" placeholder={t("addSubPh")} value={pattern} onChange={(e) => setPattern(e.target.value)} />
          <select value={qos} onChange={(e) => setQos(+e.target.value)}><option value={0}>q0</option><option value={1}>q1</option><option value={2}>q2</option></select>
          <button className="btn-accent sm" onClick={add}>{t("addSubBtn")}</button>
        </div>
      )}
    </div>
  );
}

export function TreeEmptyState() {
  const addSub = useAppStore((s) => s.addSub);
  const [pattern, setPattern] = useState("");

  async function subAll() {
    if (addSub("#", 0)) await Subscribe("#", 0);
  }
  async function subSpecific() {
    const p = pattern.trim();
    if (!p) return;
    if (addSub(p, 0)) await Subscribe(p, 0);
    setPattern("");
  }

  return (
    <div className="tree-empty">
      <div className="tree-empty-icon">↯</div>
      <div className="empty-title">{t("subEmptyTitle")}</div>
      <div className="empty-hint">{t("subEmptyHint")}</div>
      <button className="btn-accent full" onClick={subAll}>
        {t("subAll")} <span className="mono-chip-inline">#</span>
      </button>
      <div className="tree-empty-specific">
        <input placeholder={t("subSpecificPh")} value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <button className="btn-accent sm" onClick={subSpecific}>{t("subBtn")}</button>
      </div>
      <div className="tree-empty-foot">{t("floodHint")}</div>
    </div>
  );
}
