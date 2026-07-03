// frontend/src/lib/diff.ts
export interface DiffLine { key: string; kind: "changed" | "added" | "removed" | "unchanged"; value: string; prev?: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Key-level diff of two JSON objects (prev -> cur). Null when not comparable (B36). */
export function diffJson(prev: unknown, cur: unknown): DiffLine[] | null {
  if (!isPlainObject(prev) || !isPlainObject(cur)) return null;
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(cur)])].sort();
  return keys.map((key) => {
    const inPrev = key in prev, inCur = key in cur;
    const pv = JSON.stringify(prev[key]), cv = JSON.stringify(cur[key]);
    if (!inPrev) return { key, kind: "added" as const, value: cv };
    if (!inCur) return { key, kind: "removed" as const, value: pv };
    if (pv !== cv) return { key, kind: "changed" as const, value: cv, prev: pv };
    return { key, kind: "unchanged" as const, value: cv };
  });
}
