import { describe, expect, it } from "vitest";
import { resolveDeploymentRevision } from "./health-revision";

describe("deployment health revision", () => {
  it("prefers the live Render commit over a stale configured revision", () => {
    expect(resolveDeploymentRevision({
      RENDER_GIT_COMMIT: "1234567890abcdef1234567890abcdef12345678",
      APP_REVISION: "f0294f26bd1c-stale",
    })).toBe("1234567890ab");
  });

  it("uses hosting and CI metadata before the manual fallback", () => {
    expect(resolveDeploymentRevision({
      VERCEL_GIT_COMMIT_SHA: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      GITHUB_SHA: "1111111111111111111111111111111111111111",
      APP_REVISION: "2222222222222222222222222222222222222222",
    })).toBe("abcdefabcdef");

    expect(resolveDeploymentRevision({
      GITHUB_SHA: "1111111111111111111111111111111111111111",
      APP_REVISION: "2222222222222222222222222222222222222222",
    })).toBe("111111111111");
  });

  it("keeps APP_REVISION as a trimmed fallback", () => {
    expect(resolveDeploymentRevision({ APP_REVISION: "  abcdef1234567890  " })).toBe("abcdef123456");
    expect(resolveDeploymentRevision({ APP_REVISION: "   " })).toBeNull();
    expect(resolveDeploymentRevision({})).toBeNull();
  });
});
