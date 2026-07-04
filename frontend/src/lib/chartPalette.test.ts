import { describe, it, expect } from "vitest";
import { CHART_DARK, CHART_LIGHT, chartColor } from "./chartPalette";

describe("chartPalette", () => {
  it("has 5 validated colors per mode", () => {
    expect(CHART_DARK).toHaveLength(5);
    expect(CHART_LIGHT).toHaveLength(5);
  });
  it("cycles index beyond palette size", () => {
    expect(chartColor(0, "dark")).toBe(CHART_DARK[0]);
    expect(chartColor(5, "dark")).toBe(CHART_DARK[0]);
    expect(chartColor(6, "light")).toBe(CHART_LIGHT[1]);
  });
});
