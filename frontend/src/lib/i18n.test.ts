import { describe, it, expect } from "vitest";
import { DICT, t, setLang, fmtVars } from "./i18n";

describe("i18n", () => {
  it("ko and en have identical key sets (no missing copy)", () => {
    const ko = Object.keys(DICT.ko).sort();
    const en = Object.keys(DICT.en).sort();
    expect(en).toEqual(ko);
  });
  it("no empty strings", () => {
    for (const lang of ["ko", "en"] as const)
      for (const [k, v] of Object.entries(DICT[lang])) expect(v, `${lang}.${k}`).not.toBe("");
  });
  it("t() resolves and falls back to key", () => {
    setLang("ko");
    expect(t("statusConnected")).toBe("연결됨");
    expect(t("noSuchKey")).toBe("noSuchKey");
  });
  it("fmtVars substitutes {host}/{n}", () => {
    expect(fmtVars("'{host}' 호스트 (시도 {n})", { host: "h", n: 3 })).toBe("'h' 호스트 (시도 3)");
  });
  it("dead key treeAdd removed (F30)", () => {
    expect((DICT.ko as Record<string, string>)["treeAdd"]).toBeUndefined();
  });
  it("new error keys exist (F33)", () => {
    for (const k of ["errAuth", "errTls", "errRefused", "errTimeout", "errGeneric"])
      expect(DICT.ko[k as keyof typeof DICT.ko]).toBeTruthy();
  });
});
