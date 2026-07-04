import { bytesToString } from "./payload";
import type { Message } from "../types";

export interface Series { times: number[]; values: (number | null)[] }
export interface SeriesStats { now: number; min: number; max: number; avg: number }

function parseObj(s: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(s);
    return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function plainNumber(s: string): number | null {
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Numeric keys across messages, first-seen order. Plain-numeric-only topics yield ["value"]. */
export function extractNumericKeys(msgs: Message[]): string[] {
  const keys: string[] = [];
  let plain = false;
  for (const m of msgs) {
    const s = bytesToString(m.payload).trim();
    const obj = parseObj(s);
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "number" && Number.isFinite(v) && !keys.includes(k)) keys.push(k);
      }
    } else if (plainNumber(s) !== null) {
      plain = true;
    }
  }
  return keys.length === 0 && plain ? ["value"] : keys;
}

/** Time series for one key. Unparseable/missing/non-finite points become null gaps. */
export function buildSeries(msgs: Message[], key: string): Series {
  const times: number[] = [];
  const values: (number | null)[] = [];
  for (const m of msgs) {
    times.push(Date.parse(m.timestamp));
    const s = bytesToString(m.payload).trim();
    if (key === "value") {
      values.push(plainNumber(s));
      continue;
    }
    const obj = parseObj(s);
    const v = obj?.[key];
    values.push(typeof v === "number" && Number.isFinite(v) ? v : null);
  }
  return { times, values };
}

/** now(last non-null)/min/max/avg. Null when the series has no numeric points. */
export function seriesStats(values: (number | null)[]): SeriesStats | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  let now = nums[nums.length - 1];
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null) { now = values[i] as number; break; }
  }
  return { now, min, max, avg: Math.round(avg * 100) / 100 };
}
