// Stub — replaced by the full onboarding view in Task 14.
export function Welcome({ onConnect, onClose }: { onConnect: () => void; onClose?: () => void }) {
  return (
    <div className="welcome">
      <p>Welcome (stub)</p>
      <button onClick={onConnect}>Connect…</button>
      {onClose && <button onClick={onClose}>Back</button>}
    </div>
  );
}
