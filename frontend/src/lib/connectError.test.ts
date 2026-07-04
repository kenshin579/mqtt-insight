import { describe, it, expect } from "vitest";
import { classifyConnectError } from "./connectError";

describe("classifyConnectError", () => {
  it("auth", () => expect(classifyConnectError("not Authorized").key).toBe("errAuth"));
  it("bad credentials", () => expect(classifyConnectError("bad user name or password").key).toBe("errAuth"));
  it("tls", () => expect(classifyConnectError("x509: certificate signed by unknown authority").key).toBe("errTls"));
  it("refused", () => expect(classifyConnectError("dial tcp 127.0.0.1:1999: connect: connection refused").key).toBe("errRefused"));
  it("unknown host", () => expect(classifyConnectError("dial tcp: lookup nohost: no such host").key).toBe("errUnknownHost"));
  it("timeout", () => expect(classifyConnectError("context deadline exceeded").key).toBe("errTimeout"));
  it("generic keeps raw", () => {
    const r = classifyConnectError("weird failure");
    expect(r.key).toBe("errGeneric");
    expect(r.raw).toBe("weird failure");
  });
});
