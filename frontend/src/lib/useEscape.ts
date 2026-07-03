import { useEffect } from "react";

/** Calls onClose when Escape is pressed while the owning component is mounted
 * (C42/G14 keyboard pattern — used by modals/overlays; ContextMenu keeps its own
 * existing Escape handling). */
export function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}
