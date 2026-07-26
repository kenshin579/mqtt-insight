/**
 * Attributes for fields holding a technical value rather than prose.
 *
 * macOS WKWebView — which is what Wails renders in — capitalizes the first
 * letter of a text input by default and runs autocorrect over it. For anything
 * case-sensitive that silently corrupts the value: a topic typed as `sensors/#`
 * is stored as `Sensors/#` and matches nothing, and MQTT gives no error for it.
 * A host survives it only because hostname resolution ignores case.
 *
 * Spread onto every input that takes a topic, host, path, identifier, header or
 * payload. Human-facing labels like a profile name are prose and should keep the
 * platform behavior.
 */
export const identifierInput = {
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const;
