import { useEffect } from "react";

// Bottom-center toast, auto-dismisses after `ms` (B59, default 6.5s).
export function Toast({ children, onDone, ms = 6500 }: { children: React.ReactNode; onDone: () => void; ms?: number }) {
  useEffect(() => { const id = setTimeout(onDone, ms); return () => clearTimeout(id); }, [onDone, ms]);
  return <div className="toast"><span className="toast-dot">●</span>{children}</div>;
}
