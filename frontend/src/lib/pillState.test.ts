import { describe, it, expect } from "vitest";
import { pillState } from "./pillState";
import type { UpdateInfo } from "../types";

const upd: UpdateInfo = {
  version: "v0.3.0",
  releaseURL: "https://example.test/releases/v0.3.0",
  assetURL: "https://example.test/mqtt-insight-v0.3.0-macos-universal.zip",
  canSelfUpdate: true,
};

describe("pillState", () => {
  it("hides until the version has loaded", () => {
    expect(pillState("", null, null, null)).toEqual({ kind: "hidden" });
  });

  it("shows the plain version when no update is known", () => {
    expect(pillState("v0.2.0", null, null, null)).toEqual({ kind: "plain", text: "v0.2.0" });
  });

  it("shows a dev build as-is", () => {
    expect(pillState("dev", null, null, null)).toEqual({ kind: "plain", text: "dev" });
  });

  it("carries canSelfUpdate and the release URL when an update exists", () => {
    expect(pillState("v0.2.0", upd, null, null)).toEqual({
      kind: "available",
      from: "v0.2.0",
      to: "v0.3.0",
      canSelfUpdate: true,
      releaseURL: upd.releaseURL,
    });
  });

  it("passes canSelfUpdate through when self-update is unavailable", () => {
    expect(pillState("v0.2.0", { ...upd, canSelfUpdate: false }, null, null)).toMatchObject({
      kind: "available",
      canSelfUpdate: false,
    });
  });

  it("reports a download in progress", () => {
    expect(pillState("v0.2.0", upd, 42, null)).toEqual({ kind: "progress", pct: 42 });
  });

  it("treats 0% as in progress, not as absent", () => {
    // A truthiness check instead of `!== null` would fall through to "available"
    // here and the pill would flip back to the update prompt mid-download.
    expect(pillState("v0.2.0", upd, 0, null)).toEqual({ kind: "progress", pct: 0 });
  });

  it("prefers the error over progress regardless of handler order", () => {
    expect(pillState("v0.2.0", upd, 42, "disk full")).toEqual({
      kind: "error",
      message: "disk full",
      releaseURL: upd.releaseURL,
    });
  });

  it("falls back to the plain version if an error arrives with no update info", () => {
    expect(pillState("v0.2.0", null, null, "stray")).toEqual({ kind: "plain", text: "v0.2.0" });
  });
});
