import type { UpdateInfo } from "../types";

export type PillState =
  | { kind: "hidden" }
  | { kind: "plain"; text: string }
  | { kind: "available"; from: string; to: string; canSelfUpdate: boolean; releaseURL: string }
  | { kind: "progress"; pct: number }
  | { kind: "error"; message: string; releaseURL: string };

/**
 * What the titlebar pill should show.
 *
 * The priority — error, then progress, then an available update — is fixed here
 * rather than inferred from which store fields happen to be set. The
 * `update:error` handler in `bridge/events.ts` does clear the progress before
 * setting the error, but a judgement that leans on that call order breaks
 * silently the moment someone edits the handler.
 */
export function pillState(
  version: string,
  updateInfo: UpdateInfo | null,
  updateProgress: number | null,
  updateError: string | null,
): PillState {
  if (!version) return { kind: "hidden" };

  if (updateInfo) {
    if (updateError) {
      return { kind: "error", message: updateError, releaseURL: updateInfo.releaseURL };
    }
    if (updateProgress !== null) {
      return { kind: "progress", pct: updateProgress };
    }
    return {
      kind: "available",
      from: version,
      to: updateInfo.version,
      canSelfUpdate: updateInfo.canSelfUpdate,
      releaseURL: updateInfo.releaseURL,
    };
  }

  // An error without updateInfo should be unreachable: updateError is only set
  // by a failed ApplyUpdate, which needs an update to apply. Falling back to the
  // plain version rather than inventing an error state that has no release link
  // to offer.
  return { kind: "plain", text: version };
}
