// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { config } from "../../wailsjs/go/models";
import { DeleteProfile } from "../../wailsjs/go/main/App";
import { ConnectionHome } from "./ConnectionHome";
import { setLang } from "../lib/i18n";

// Wails 바인딩은 네이티브 브릿지라 테스트에서 모킹이 불가피하다.
vi.mock("../../wailsjs/go/main/App", () => ({
  Connect: vi.fn(() => Promise.resolve()),
  DeleteProfile: vi.fn(() => Promise.resolve()),
}));

const profile = config.Profile.createFrom({
  name: "Local test", host: "localhost", port: 1883, transport: "tcp", version: "5.0",
});

function renderHome(onProfilesChanged = vi.fn()) {
  setLang("ko");
  render(
    <ConnectionHome profiles={[profile]} onNew={() => {}} onEdit={() => {}}
      onProfilesChanged={onProfilesChanged} />,
  );
  return { onProfilesChanged };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// F27 회귀: window.confirm은 macOS WKWebView(Wails)에 구현이 없어 항상 false를
// 반환한다. 확인 UI는 앱 내부 다이얼로그여야 삭제가 실제로 실행된다.
test("삭제를 확인하면 프로필이 실제로 삭제된다", async () => {
  const { onProfilesChanged } = renderHome();

  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

  await waitFor(() => expect(DeleteProfile).toHaveBeenCalledWith("Local test"));
  await waitFor(() => expect(onProfilesChanged).toHaveBeenCalled());
});

test("취소하면 삭제되지 않고 다이얼로그가 닫힌다", async () => {
  renderHome();

  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(DeleteProfile).not.toHaveBeenCalled();
});

test("Escape로 다이얼로그를 닫으면 삭제되지 않는다", async () => {
  renderHome();

  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  await screen.findByRole("dialog");
  fireEvent.keyDown(document, { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(DeleteProfile).not.toHaveBeenCalled();
});
