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

/** Thin uPlot wrapper: one line series, crosshair+tooltip, width tracks container. */
export function UPlotChart({ times, values, color, height, label }: UPlotChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const opts: uPlot.Options = {
      width: host.clientWidth || 300,
      height,
      cursor: { sync: { key: SYNC_KEY }, points: { size: 6 } },
      legend: { show: false }, // 단일 시리즈 — 칩/헤더가 범례 역할 (dataviz: 1시리즈는 legend box 불필요)
      scales: { x: { time: true } },
      axes: [
        { stroke: "var(--dim2)", grid: { stroke: "var(--line)", width: 1 }, ticks: { show: false } },
        { stroke: "var(--dim2)", grid: { stroke: "var(--line)", width: 1 }, ticks: { show: false }, size: 46 },
      ],
      series: [
        {},
        { label, stroke: color, width: 2, points: { show: false }, spanGaps: false },
      ],
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
