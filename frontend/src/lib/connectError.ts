// frontend/src/lib/connectError.ts
export interface ConnectError { key: string; host?: string; raw?: string }

const RULES: [RegExp, string][] = [
  [/not authori[sz]ed|bad user name or password|username or password/i, "errAuth"],
  [/x509|tls|certificate/i, "errTls"],
  [/connection refused/i, "errRefused"],
  [/no such host|lookup .* on/i, "errUnknownHost"],
  [/deadline exceeded|timeout|timed out/i, "errTimeout"],
];

export function classifyConnectError(raw: string, host?: string): ConnectError {
  for (const [re, key] of RULES) if (re.test(raw)) return { key, host, raw };
  return { key: "errGeneric", host, raw };
}
