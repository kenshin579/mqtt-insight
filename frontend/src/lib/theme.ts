// Theme application (G15) — resolves "system" via matchMedia and writes data-theme.
// Lives outside App.tsx so components like SettingsModal can import it without a
// circular dependency (App.tsx renders SettingsModal).
export function applyTheme(theme: string) {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : theme;
  document.documentElement.dataset.theme = resolved;
}
