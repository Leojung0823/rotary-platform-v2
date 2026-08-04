import { describe, expect, it, vi } from "vitest";
import {
  parseStagingDeployCommit,
  parseStagingDeployHook,
  triggerStagingDeployment,
} from "./staging-deploy-hook.mjs";

describe("staging deployment hook", () => {
  const lookupImpl = vi.fn().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  const commitSha = "0123456789abcdef0123456789abcdef01234567";

  it("sends one timeout-bounded POST for the exact approved commit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await expect(triggerStagingDeployment(
      "https://deploy.rotary.org/hooks/opaque-value?branch=main",
      { fetchImpl, lookupImpl, timeoutMs: 5_000, commitSha },
    )).resolves.toEqual({ accepted: true, status: 202 });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const requestedUrl = fetchImpl.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.get("branch")).toBe("main");
    expect(requestedUrl.searchParams.get("ref")).toBe(commitSha);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "manual" });
  });

  it("overwrites a stale deploy-hook ref with the approved commit", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await triggerStagingDeployment(
      "https://deploy.rotary.org/hooks/opaque-value?ref=old-commit",
      { fetchImpl, lookupImpl, commitSha },
    );

    const requestedUrl = fetchImpl.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.getAll("ref")).toEqual([commitSha]);
  });

  it("requires a full hexadecimal deployment commit", () => {
    expect(parseStagingDeployCommit(commitSha.toUpperCase())).toBe(commitSha);
    for (const value of ["", "main", "0123456", `${commitSha}00`, "g".repeat(40)]) {
      expect(() => parseStagingDeployCommit(value), value).toThrow("STAGING_DEPLOY_COMMIT_INVALID");
    }
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
        commitSha,
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
      commitSha,
    })).rejects.toThrow("STAGING_DEPLOY_HOOK_DNS_UNSAFE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
