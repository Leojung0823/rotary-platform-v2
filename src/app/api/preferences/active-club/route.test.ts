import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  resolveExperienceContext: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("@/lib/experience-context.server", () => ({
  resolveExperienceContext: mocks.resolveExperienceContext,
}));

import * as route from "./route";

const clubOne = {
  clubId: "a1000000-0000-4000-8000-000000000001",
  clubCode: "SHELL-ONE",
  clubName: "本機 Shell 社員社",
  canManage: false,
};
const clubTwo = {
  clubId: "a1000000-0000-4000-8000-000000000003",
  clubCode: "SHELL-THREE",
  clubName: "本機 Shell 第三社",
  canManage: false,
};

function request({
  origin = "http://localhost:3000",
  fetchSite = "same-origin",
  clubId = clubTwo.clubId,
  mode = "member",
}: {
  origin?: string;
  fetchSite?: string;
  clubId?: string;
  mode?: string;
} = {}) {
  return new NextRequest("http://localhost:3000/api/preferences/active-club", {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": fetchSite,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ clubId, mode }),
  });
}

function context() {
  return {
    ok: true,
    context: {
      hasActiveMembership: true,
      canRegister: true,
      canManage: false,
      hasPlatformAccess: false,
      memberClubs: [clubOne, clubTwo],
      managedOnlyClubs: [],
      activeClubId: clubOne.clubId,
      defaultMode: "member",
      availableModes: ["member"],
    },
  } as const;
}

describe("POST /api/preferences/active-club", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    mocks.cookieGet.mockReset().mockReturnValue(undefined);
    mocks.resolveExperienceContext.mockReset().mockResolvedValue(context());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sets the selected club before redirecting to the requested mode", async () => {
    const response = await route.POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard?mode=member");
    expect(response.headers.get("set-cookie")).toContain(
      `rotary_active_club_v1=${clubTwo.clubId};`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(mocks.resolveExperienceContext).toHaveBeenCalledWith(null);
  });

  it("falls back to the current valid club when the submitted club is not in the mode", async () => {
    const response = await route.POST(request({ clubId: "a1000000-0000-4000-8000-000000000099" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain(
      `rotary_active_club_v1=${clubOne.clubId};`,
    );
  });

  it("rejects cross-site mutations before resolving the authenticated context", async () => {
    const response = await route.POST(request({ origin: "https://evil.example", fetchSite: "cross-site" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/access-denied");
    expect(mocks.resolveExperienceContext).not.toHaveBeenCalled();
  });

  it("does not expose a GET mutation endpoint", () => {
    expect("GET" in route).toBe(false);
  });
});
