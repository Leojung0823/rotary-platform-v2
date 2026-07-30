import { describe, expect, it, vi } from "vitest";
import {
  parseStagingDeployHook,
  triggerStagingDeployment,
} from "./staging-deploy-hook.mjs";

describe("staging deployment hook", () => {
  const lookupImpl = vi.fn().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);

  it("sends one timeout-bounded POST without following redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await expect(triggerStagingDeployment(
      "https://deploy.rotary.org/hooks/opaque-value?branch=main",
      { fetchImpl, lookupImpl, timeoutMs: 5_000 },
    )).resolves.toEqual({ accepted: true, status: 202 });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "manual" });
  });

  it("rejects unsafe origins, URL credentials and fragments", () => {
    for (const value of [
      "http://deploy.rotary.org/hook",
      "https://user:password@deploy.rotary.org/hook",
      "https://127.0.0.1/hook",
      "https://169.254.169.254/hook",
      "https://[::1]/hook",
      "https://deploy.rotary.org/hook#secret",
    ]) {
      expect(() => parseStagingDeployHook(value), value).toThrow(/STAGING_DEPLOY_HOOK_/u);
    }
  });

  it("does not follow either same-origin or cross-origin redirects", async () => {
    for (const location of ["/accepted", "https://other.rotary.org/accepted"]) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
        status: 307,
        headers: { location },
      }));
      await expect(triggerStagingDeployment("https://deploy.rotary.org/hook", { fetchImpl, lookupImpl }))
        .rejects.toThrow("STAGING_DEPLOY_HOOK_REDIRECT_REJECTED");
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it("returns only a sanitized error code when the request fails", async () => {
    const secretHook = "https://deploy.rotary.org/hooks/never-print-this-value";
    let error;
    try {
      await triggerStagingDeployment(secretHook, {
        fetchImpl: vi.fn().mockRejectedValue(new Error(`request failed for ${secretHook}`)),
        lookupImpl,
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).not.toContain(secretHook);
    expect(String(error)).toContain("STAGING_DEPLOY_HOOK_REQUEST_FAILED");
  });

  it("rejects a public-looking hook hostname that resolves privately", async () => {
    const fetchImpl = vi.fn();
    await expect(triggerStagingDeployment("https://deploy.rotary.org/hook", {
      fetchImpl,
      lookupImpl: vi.fn().mockResolvedValue([{ address: "10.0.0.8", family: 4 }]),
    })).rejects.toThrow("STAGING_DEPLOY_HOOK_DNS_UNSAFE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
