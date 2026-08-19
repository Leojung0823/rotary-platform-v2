import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { archiveMutationAllowed, archiveRpcStatus } from "./http";

afterEach(() => vi.unstubAllEnvs());

describe("archive HTTP boundary", () => {
  it("accepts only an exact same-origin upload", () => {
    const sameOrigin = new NextRequest("https://app.example.test/api/v1/archive/uploads", {
      method: "POST",
      headers: { origin: "https://app.example.test", "sec-fetch-site": "same-origin" },
    });
    const sibling = new NextRequest("https://app.example.test/api/v1/archive/uploads", {
      method: "POST",
      headers: { origin: "https://evil.example.test", "sec-fetch-site": "same-site" },
    });
    expect(archiveMutationAllowed(sameOrigin)).toBe(true);
    expect(archiveMutationAllowed(sibling)).toBe(false);
  });

  it("can accept the explicitly configured canonical site origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.test");
    const request = new NextRequest("https://internal.example.test/api/v1/archive/uploads", {
      method: "POST",
      headers: { origin: "https://app.example.test", "sec-fetch-site": "same-origin" },
    });
    expect(archiveMutationAllowed(request)).toBe(true);
  });

  it("maps authorization and lifecycle failures without exposing database messages", () => {
    expect(archiveRpcStatus({ code: "42501" })).toBe(403);
    expect(archiveRpcStatus({ code: "55000" })).toBe(409);
    expect(archiveRpcStatus({ code: "anything" })).toBe(500);
  });
});
