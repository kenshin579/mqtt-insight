// frontend/src/lib/time.ts
import { useEffect, useState } from "react";
import type { Lang } from "./i18n";

export function relativeTime(iso: string, lang: Lang, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  const [n, unit] = s < 60 ? [s, 0] : s < 3600 ? [Math.floor(s / 60), 1] : [Math.floor(s / 3600), 2];
  const ko = ["초 전", "분 전", "시간 전"], en = ["s ago", "m ago", "h ago"];
  return lang === "ko" ? `${n}${ko[unit]}` : `${n}${en[unit]}`;
}

export function formatTime(iso: string, mode: "absolute" | "relative", lang: Lang, nowMs?: number): string {
  if (mode === "relative") return relativeTime(iso, lang, nowMs);
  return new Date(iso).toLocaleTimeString("en-GB"); // HH:MM:SS (F13/B30)
}

/** 1s ticker for relative mode (F25). Returns a counter to force re-render. */
export function useNowTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}
