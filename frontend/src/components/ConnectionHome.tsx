import { config } from "../../wailsjs/go/models";

// Stub — replaced by the full saved-profiles view in Task 15.
export function ConnectionHome({ profiles, onNew, onEdit, onProfilesChanged }: {
  profiles: config.Profile[]; onNew: () => void; onEdit: (p: config.Profile) => void; onProfilesChanged: () => void;
}) {
  void onProfilesChanged;
  return (
    <div className="connection-home">
      <p>Connection home (stub)</p>
      <button onClick={onNew}>New connection</button>
      {profiles.map((p) => (
        <button key={p.name} onClick={() => onEdit(p)}>{p.name || p.host}</button>
      ))}
    </div>
  );
}
