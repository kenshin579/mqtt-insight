import { SetFocus } from "../../wailsjs/go/main/App";
import { useAppStore } from "../store/appStore";
import { STREAM_LEAF_THRESHOLD } from "../lib/subtree";
import type { Message } from "../types";

/**
 * The single entry point for topic selection.
 *
 * Selection and backend focus must always move together — if some component
 * set the selection without calling SetFocus, the stream would silently stay
 * on the previous topic. Routing every selection through here also keeps the
 * subtree size guard in one place.
 */
export async function applyFocus(topic: string | null, isLeaf: boolean, leaves: number): Promise<void> {
  const st = useAppStore.getState();

  // Too wide to stream: stop the stream and show a summary instead, so an
  // accidental click on a parent node cannot re-create the firehose.
  if (topic && leaves > STREAM_LEAF_THRESHOLD) {
    await SetFocus("");
    st.showSubtreeSummary(topic);
    return;
  }

  const msgs = (await SetFocus(topic ?? "")) as unknown as Message[] | null;
  st.focusTopic(topic, isLeaf, msgs ?? []);
}
