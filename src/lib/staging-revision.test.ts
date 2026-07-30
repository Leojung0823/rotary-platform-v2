import { describe, expect, it, vi } from "vitest";
import {
  inspectStagingHealth,
  parseStagingOrigin,
  readStagingHealth,
  requestStagingHealth,
} from "./staging-revision.mjs";

const sha = "abcdef0123456789abcdef0123456789abcdef01";

function healthySnapshot() {
  return {
    status: "ok",
    environment: "staging",
    revision: sha.slice(0, 12),
    checks: { configuration: true, database: true },
    issues: [],
  };
}

describe("staging revision wait", () => {
  const lookupImpl = vi.fn().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);

  it("accepts only a credential-free public HTTPS origin", () => {
    expect(parseStagingOrigin("https://staging.rotary.org").origin).toBe("https://staging.rotary.org");
    for (const value of [
      "http://staging.rotary.org",
      "https://user:password@staging.rotary.org",
      "https://staging.rotary.org/path",
      "https://staging.rotary.org/?query=1",
      "https://staging.rotary.org/#fragment",
      "https://localhost",
      "https://staging",
      "https://service.local",
      "https://service.internal",
      "https://service.lan",
      "https://gateway.home.arpa",
      "https://service.test",
      "https://service.invalid",
      "https://service.example",
    ]) {
      expect(() => parseStagingOrigin(value), value).toThrow("STAGING_BASE_URL_UNSAFE");
    }
  });

  it("does not let a preconstructed URL bypass origin validation", async () => {
    await expect(requestStagingHealth(new URL("http://staging.rotary.org"), {
      fetchImpl: vi.fn(),
      lookupImpl,
    })).rejects.toThrow("STAGING_BASE_URL_UNSAFE");
  });

  it("rejects non-public IPv4, IPv6 and mapped IPv4 addresses", () => {
    for (const host of [
      "127.0.0.1", "10.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1",
      "192.168.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
      "224.0.0.1", "240.0.0.1", "[::1]", "[fd00::1]", "[fe80::1]", "[ff02::1]",
      "[2001:db8::1]", "[::ffff:127.0.0.1]", "[::ffff:10.0.0.1]",
    ]) {
      expect(() => parseStagingOrigin(`https://${host}`), host).toThrow("STAGING_BASE_URL_UNSAFE");
    }
  });

  it("follows relative same-origin redirects with no-cache and rejects cross-origin redirects", async () => {
    const sameOriginFetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "/health/ready" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(healthySnapshot()), { status: 200 }));
    const response = await requestStagingHealth("https://staging.rotary.org", {
      fetchImpl: sameOriginFetch,
      lookupImpl,
    });
    expect(response.status).toBe(200);
    expect(sameOriginFetch).toHaveBeenCalledTimes(2);
    expect(sameOriginFetch.mock.calls[0][1].headers["cache-control"]).toBe("no-cache");

    const crossOriginFetch = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "https://other.rotary.org/api/health" },
    }));
    await expect(requestStagingHealth("https://staging.rotary.org", {
      fetchImpl: crossOriginFetch,
      lookupImpl,
    }))
      .rejects.toThrow("STAGING_REDIRECT_ORIGIN_MISMATCH");
    expect(crossOriginFetch).toHaveBeenCalledOnce();
  });

  it("rejects a public-looking staging hostname that resolves privately", async () => {
    const fetchImpl = vi.fn();
    await expect(requestStagingHealth("https://staging.rotary.org", {
      fetchImpl,
      lookupImpl: vi.fn().mockResolvedValue([{ address: "192.168.1.8", family: 4 }]),
    })).rejects.toThrow("STAGING_HEALTH_DNS_UNSAFE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires the exact healthy staging revision and no public issues", () => {
    expect(inspectStagingHealth(healthySnapshot(), sha)).toEqual({ ok: true, errors: [] });
    const result = inspectStagingHealth({
      ...healthySnapshot(),
      status: "degraded",
      environment: "production",
      revision: "000000000000",
      checks: { configuration: false, database: false },
      issues: ["DATABASE_UNAVAILABLE"],
    }, sha);
    expect(result.errors).toEqual(expect.arrayContaining([
      "HEALTH_STATUS_NOT_OK",
      "HEALTH_ENVIRONMENT_MISMATCH",
      "HEALTH_REVISION_MISMATCH",
      "HEALTH_CONFIGURATION_FAILED",
      "HEALTH_DATABASE_FAILED",
      "HEALTH_PUBLIC_ISSUES_PRESENT",
    ]));
  });

  it("rejects non-200, oversized and invalid JSON health responses", async () => {
    await expect(readStagingHealth(new Response("unavailable", { status: 503 })))
      .rejects.toThrow("STAGING_HEALTH_HTTP_NOT_OK");
    await expect(readStagingHealth(new Response("x".repeat(100)), 32))
      .rejects.toThrow("STAGING_HEALTH_RESPONSE_TOO_LARGE");
    await expect(readStagingHealth(new Response("not json")))
      .rejects.toThrow("STAGING_HEALTH_RESPONSE_INVALID");
  });
});
