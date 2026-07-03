import { useAppStore } from "../store/appStore";
import { t } from "../lib/i18n";
import { useEscape } from "../lib/useEscape";

// B29/C26/C27/F9: message search row — ⌕ + live filter input + N/M match counter + ✕ close (clears query).
export function SearchBar({ matches, total }: { matches: number; total: number }) {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearch = useAppStore((s) => s.setSearch);
  useEscape(() => setSearch(false)); // C42/F28
  return (
    <div className="search-row">
      <span className="glyph">⌕</span>
      <input
        className="mono"
        autoFocus
        placeholder={t("searchPh")}
        value={searchQuery}
        onChange={(e) => setSearch(true, e.target.value)}
      />
      {searchQuery && (
        <span className="match-count mono">
          {matches} / {total}
        </span>
      )}
      <button className="chip-x" onClick={() => setSearch(false)}>✕</button>
    </div>
  );
}
