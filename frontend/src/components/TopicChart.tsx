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

  // FIX 1: all-topics 뷰는 여러 토픽이 섞인 rows를 넘길 수 있음 — 여기서 방어적으로 필터링
  const topicRows = useMemo(
    () => (topic ? rows.filter((m) => m.topic === topic) : rows),
    [rows, topic],
  );

  const keys = useMemo(() => extractNumericKeys(topicRows), [topicRows]);

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

  // FIX 3: 초기화는 토픽당 1회만 — 사용자가 모든 칩을 꺼서 active가 비어도 되살리지 않는다.
  const [active, setActive] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    // 토픽 변경: 초기화 플래그 리셋 — 아래 keys effect가 새 토픽의 첫 키를 활성화한다
    initializedRef.current = false;
    setActive(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
  useEffect(() => {
    // 최초 1회, 키가 나타나면 첫 키만 활성화. 이후 사용자가 모두 꺼도 다시 켜지 않는다.
    if (!initializedRef.current && keys.length > 0) {
      initializedRef.current = true;
      setActive(new Set([keys[0]]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  useEffect(() => {
    // FIX 4: 사라진(고스트) 키는 active에서 정리만 한다 — 되살리지 않음
    setActive((prev) => {
      const next = new Set([...prev].filter((k) => keys.includes(k)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  // FIX 6: buildSeries/seriesStats memoized together — avoids recompute on unrelated re-renders
  const panels = useMemo(
    () =>
      [...active]
        .filter((k) => keys.includes(k)) // FIX 4: orphaned keys don't render ghost charts
        .map((k) => {
          const s = buildSeries(topicRows, k);
          return { k, series: s, stats: seriesStats(s.values) };
        }),
    [active, keys, topicRows],
  );

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
      {panels.map(({ k, series, stats }) => {
        const idx = colorMap.current.get(k) ?? 0;
        const color = chartColor(idx, resolved);
        return (
          <div className="chart-panel" key={k}>
            <div className="chart-panel-head">
              <span className="cdot" style={{ background: color }} />
              <span className="chart-key mono">{k}</span>
              {stats && (
                <span className="chart-stats">
                  now <b>{stats.now}</b> · min <b>{stats.min}</b> · max <b>{stats.max}</b> · avg <b>{stats.avg}</b>
                </span>
              )}
            </div>
            <UPlotChart times={series.times} values={series.values} color={color} height={CHART_HEIGHT} label={k} />
          </div>
        );
      })}
    </div>
  );
}
