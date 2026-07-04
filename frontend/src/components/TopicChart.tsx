import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { extractNumericKeys, buildSeries, seriesStats } from "../lib/series";
import { chartColor } from "../lib/chartPalette";
import { UPlotChart } from "./UPlotChart";
import { t } from "../lib/i18n";
import type { Message } from "../types";

const MAX_ACTIVE = 5;
const CHART_HEIGHT = 110;

/** Chart mode body: key chips (legend) + per-key small-multiple charts with stats. */
export function TopicChart({ topic, rows }: { topic: string | null; rows: Message[] }) {
  const theme = useAppStore((s) => s.settings.theme);
  // system 테마는 문서 data-theme으로 이미 해석됨 — 실제 표시 테마를 읽는다
  const resolved = (document.documentElement.dataset.theme as "dark" | "light") ?? "dark";
  void theme; // settings 변경 시 리렌더 트리거용 구독

  const keys = useMemo(() => extractNumericKeys(rows), [rows]);

  // 색 배정: 키 최초 등장 순서 sticky (토픽 바뀌면 리셋) — 색은 엔티티를 따라감
  const colorMap = useRef<Map<string, number>>(new Map());
  const topicRef = useRef(topic);
  if (topicRef.current !== topic) {
    topicRef.current = topic;
    colorMap.current = new Map();
  }
  for (const k of keys) {
    if (!colorMap.current.has(k)) colorMap.current.set(k, colorMap.current.size);
  }

  const [active, setActive] = useState<Set<string>>(new Set());
  useEffect(() => {
    // 토픽 변경/최초: 첫 키만 활성
    setActive(new Set(keys.slice(0, 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
  useEffect(() => {
    // 키가 뒤늦게 나타났고 아무것도 활성 아니면 첫 키 활성
    if (active.size === 0 && keys.length > 0) setActive(new Set([keys[0]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  function toggleKey(k: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else if (next.size < MAX_ACTIVE) next.add(k);
      return next;
    });
  }

  if (keys.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">〜</span>
        <div className="empty-title">{t("chartNoNumeric")}</div>
        <div className="empty-hint">{t("chartNoNumericHint")}</div>
      </div>
    );
  }

  return (
    <div className="topic-chart">
      <div className="chart-chips">
        {keys.map((k) => {
          const idx = colorMap.current.get(k) ?? 0;
          const on = active.has(k);
          const capped = !on && active.size >= MAX_ACTIVE;
          return (
            <button key={k} className={"chart-chip" + (on ? " on" : "")}
              title={capped ? t("chartMaxKeys") : k} onClick={() => toggleKey(k)}>
              <span className="cdot" style={{ background: chartColor(idx, resolved) }} />
              {k}
            </button>
          );
        })}
      </div>
      {[...active].map((k) => {
        const idx = colorMap.current.get(k) ?? 0;
        const s = buildSeries(rows, k);
        const st = seriesStats(s.values);
        const color = chartColor(idx, resolved);
        return (
          <div className="chart-panel" key={k}>
            <div className="chart-panel-head">
              <span className="cdot" style={{ background: color }} />
              <span className="chart-key mono">{k}</span>
              {st && (
                <span className="chart-stats">
                  now <b>{st.now}</b> · min <b>{st.min}</b> · max <b>{st.max}</b> · avg <b>{st.avg}</b>
                </span>
              )}
            </div>
            <UPlotChart times={s.times} values={s.values} color={color} height={CHART_HEIGHT} label={k} />
          </div>
        );
      })}
    </div>
  );
}
