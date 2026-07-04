// Reusable segmented control (settings sections, Live/Recorded toggle, format tabs).
export function SegmentedControl<T extends string>({ options, value, onChange, size = "md" }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <span className={`seg seg-${size}`}>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </span>
  );
}
