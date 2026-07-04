import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

// 크로스헤어 동기화 그룹 (small multiples 간 커서 정렬 — 스펙 §3)
const SYNC_KEY = "mqtt-insight-chart";

export interface UPlotChartProps {
  times: number[];             // epoch ms
  values: (number | null)[];
  color: string;
  height: number;
  label: string;               // 시리즈명 (툴팁/범례용)
}

/** Thin uPlot wrapper: one line series, crosshair + cursor-following tooltip, width tracks container. */
export function UPlotChart({ times, values, color, height, label }: UPlotChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // FIX 2 (spec §3): 커서를 따라다니는 툴팁 — HH:MM:SS + 값
    const tip = document.createElement("div");
    tip.className = "uplot-tip";
    tip.style.display = "none";

    // uPlot은 축/그리드를 canvas에 그리므로 CSS 변수를 쓸 수 없다 — 실제 색으로 해석해서 전달.
    // (var(--x) 문자열은 canvas에서 무효 → 라벨이 이전 fillStyle/검정으로 그려져 안 보이는 버그의 원인)
    const css = getComputedStyle(document.documentElement);
    const axisColor = css.getPropertyValue("--dim2").trim() || "#6a6a76";
    const gridColor = css.getPropertyValue("--line").trim() || "#2e2e37";
    const axisFont = `10px ${css.getPropertyValue("--font-mono").trim() || "ui-monospace, monospace"}`;
    const axisBase = {
      stroke: axisColor,
      font: axisFont,
      grid: { stroke: gridColor, width: 1 },
      ticks: { show: false },
    } as const;

    const opts: uPlot.Options = {
      width: host.clientWidth || 300,
      height,
      cursor: { sync: { key: SYNC_KEY }, points: { size: 6 } },
      legend: { show: false }, // 단일 시리즈 — 칩/헤더가 범례 역할 (dataviz: 1시리즈는 legend box 불필요)
      scales: { x: { time: true } },
      axes: [
        { ...axisBase },
        { ...axisBase, size: 46 },
      ],
      series: [
        {},
        { label, stroke: color, width: 2, points: { show: false }, spanGaps: false },
      ],
      hooks: {
        init: [
          (u) => {
            u.over.appendChild(tip);
          },
        ],
        setCursor: [
          (u) => {
            const { idx, left, top } = u.cursor;
            if (idx == null || left == null || left < 0) {
              tip.style.display = "none";
              return;
            }
            const v = u.data[1][idx];
            if (v == null) {
              tip.style.display = "none";
              return;
            }
            const ts = new Date((u.data[0][idx] as number) * 1000);
            tip.textContent = `${ts.toLocaleTimeString("en-GB")}  ${v}`;
            tip.style.display = "block";
            tip.style.left = `${Math.min(left + 8, u.over.clientWidth - tip.offsetWidth - 4)}px`;
            tip.style.top = `${Math.max((top ?? 0) - 24, 0)}px`;
          },
        ],
      },
    };
    // uPlot expects x in SECONDS when time:true
    const data: uPlot.AlignedData = [times.map((t) => t / 1000), values];
    const plot = new uPlot(opts, data, host);
    plotRef.current = plot;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && plotRef.current) plotRef.current.setSize({ width: w, height });
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // 재생성은 color/height/label 변경 시에만; 데이터는 아래 setData로 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, height, label]);

  useEffect(() => {
    plotRef.current?.setData([times.map((t) => t / 1000), values]);
  }, [times, values]);

  return <div ref={hostRef} className="uplot-host" />;
}
