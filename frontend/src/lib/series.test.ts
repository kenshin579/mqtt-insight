import { describe, it, expect } from "vitest";
import { extractNumericKeys, buildSeries, seriesStats } from "./series";
import type { Message } from "../types";

function msg(payload: string, ts = "2026-07-04T01:00:00.000Z", topic = "t"): Message {
  return { topic, payload: btoa(payload), qos: 0, retained: false, timestamp: ts };
}

describe("extractNumericKeys", () => {
  it("json top-level numeric keys in first-seen order", () => {
    const keys = extractNumericKeys([msg('{"b":1,"a":2,"s":"x"}'), msg('{"c":3,"b":4}')]);
    expect(keys).toEqual(["b", "a", "c"]); // 문자열 값 s 제외, 등장 순서 유지
  });
  it("plain numeric payload becomes virtual key 'value'", () => {
    expect(extractNumericKeys([msg("23.4"), msg("25")])).toEqual(["value"]);
  });
  it("json keys take precedence over plain when mixed", () => {
    expect(extractNumericKeys([msg("1"), msg('{"a":2}')])).toEqual(["a"]);
  });
  it("non-numeric only -> empty", () => {
    expect(extractNumericKeys([msg("hello"), msg('{"s":"x"}'), msg('{"arr":[1]}')])).toEqual([]);
  });
});

describe("buildSeries", () => {
  it("builds times(ms) and values with gaps for missing/unparseable", () => {
    const t1 = "2026-07-04T01:00:00.000Z", t2 = "2026-07-04T01:00:02.000Z", t3 = "2026-07-04T01:00:04.000Z";
    const s = buildSeries([msg('{"a":1}', t1), msg("not-json", t2), msg('{"b":9}', t3)], "a");
    expect(s.times).toEqual([Date.parse(t1), Date.parse(t2), Date.parse(t3)]);
    expect(s.values).toEqual([1, null, null]); // 파싱 실패·키 부재 → null 갭
  });
  it("plain numeric via 'value' key; NaN/Infinity excluded", () => {
    const s = buildSeries([msg("1.5"), msg("Infinity"), msg("2.5")], "value");
    expect(s.values).toEqual([1.5, null, 2.5]);
  });
  it("non-finite json numbers become gaps", () => {
    const s = buildSeries([msg('{"a":1}'), msg('{"a":"x"}')], "a");
    expect(s.values).toEqual([1, null]);
  });
});

describe("seriesStats", () => {
  it("now/min/max/avg over non-null values", () => {
    expect(seriesStats([1, null, 3, 2])).toEqual({ now: 2, min: 1, max: 3, avg: 2 });
  });
  it("all-null -> null", () => {
    expect(seriesStats([null, null])).toBeNull();
  });
  it("single value", () => {
    expect(seriesStats([5])).toEqual({ now: 5, min: 5, max: 5, avg: 5 });
  });
});
