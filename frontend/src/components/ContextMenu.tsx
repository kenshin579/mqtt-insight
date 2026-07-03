import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Dependency-free context menu rendered at (x, y). Closes on outside click or Escape. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // F10: clamp so the menu never renders past the window edge.
  const cx = Math.min(x, window.innerWidth - 190);
  const cy = Math.min(y, window.innerHeight - 130);

  return (
    <div ref={ref} className="context-menu" style={{ left: cx, top: cy }}>
      {items.map((it) => (
        <button
          key={it.label}
          disabled={it.disabled}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
