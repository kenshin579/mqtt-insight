// frontend/src/lib/mqttMatch.ts
export interface Sub { pattern: string; qos: number }

/** MQTT topic filter match (#, +) per spec. */
export function topicMatches(topic: string, filter: string): boolean {
  const t = topic.split("/");
  const f = filter.split("/");
  for (let i = 0; i < f.length; i++) {
    if (i >= t.length) return f[i] === "#" && i === f.length - 1;
    if (f[i] === "#") return true;
    if (f[i] !== "+" && f[i] !== t[i]) return false;
  }
  return t.length === f.length;
}

export function matchesAny(topic: string, subs: Sub[]): boolean {
  return subs.some((s) => topicMatches(topic, s.pattern));
}
