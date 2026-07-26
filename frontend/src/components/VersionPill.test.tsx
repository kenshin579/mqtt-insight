// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApplyUpdate } from "../../wailsjs/go/main/App";
import { useAppStore } from "../store/appStore";
import { VersionPill } from "./VersionPill";
import { setLang, t } from "../lib/i18n";
import type { UpdateInfo } from "../types";

// Wails 바인딩은 네이티브 브릿지라 테스트에서 모킹이 불가피하다.
vi.mock("../../wailsjs/go/main/App", () => ({
  ApplyUpdate: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../wailsjs/runtime/runtime", () => ({
  BrowserOpenURL: vi.fn(),
}));

const upd: UpdateInfo = {
  version: "v0.3.0",
  releaseURL: "https://example.test/releases/v0.3.0",
  assetURL: "https://example.test/a.zip",
  canSelfUpdate: true,
};

beforeEach(() => {
  setLang("ko");
  vi.clearAllMocks();
  useAppStore.setState({ version: "", updateInfo: null, updateProgress: null, updateError: null });
});
afterEach(cleanup);

function openPopover() {
  render(<VersionPill />);
  fireEvent.click(screen.getByRole("button"));
}

test("renders nothing until the version resolves", () => {
  const { container } = render(<VersionPill />);
  expect(container.innerHTML).toBe("");
});

test("shows a dev build as inert text, not a button", () => {
  useAppStore.setState({ version: "dev" });
  render(<VersionPill />);
  expect(screen.getByText("dev")).toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
});

test("does not apply the update in one click", () => {
  useAppStore.setState({ version: "v0.2.0", updateInfo: upd });
  openPopover();
  // The click opens a popover; applying must take a second, deliberate step.
  expect(ApplyUpdate).not.toHaveBeenCalled();
  expect(screen.getByText(t("updRestart"))).toBeDefined();
});

test("offers a retry after a failed update", () => {
  // Regression guard: error outranks available in pillState, and the only code
  // that clears updateError lives in this menu item — gating it on the
  // available state alone left the pill permanently stuck on failure.
  useAppStore.setState({ version: "v0.2.0", updateInfo: upd, updateError: "disk full" });
  openPopover();

  fireEvent.click(screen.getByText(t("updRestart")));
  expect(ApplyUpdate).toHaveBeenCalledOnce();
  expect(useAppStore.getState().updateError).toBeNull();
  expect(useAppStore.getState().updateProgress).toBe(0);
});

test("omits the retry when self-update is unavailable", () => {
  useAppStore.setState({
    version: "v0.2.0",
    updateInfo: { ...upd, canSelfUpdate: false },
    updateError: "translocated",
  });
  openPopover();
  expect(screen.queryByText(t("updRestart"))).toBeNull();
  expect(screen.getByText(t("updOpenRelease"))).toBeDefined();
});

test("cannot be clicked while downloading", () => {
  useAppStore.setState({ version: "v0.2.0", updateInfo: upd, updateProgress: 42 });
  render(<VersionPill />);
  expect(screen.queryByRole("button")).toBeNull();
});
