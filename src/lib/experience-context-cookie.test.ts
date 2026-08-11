import { describe, expect, it } from "vitest";
import {
  activeClubCookieMaxAgeSeconds,
  activeClubCookieName,
  activeClubCookieOptions,
  readActiveClubPreference,
} from "./experience-context-cookie";

describe("active club cookie boundary", () => {
  it("accepts only opaque UUID preferences", () => {
    expect(readActiveClubPreference("30000000-0000-4000-8000-000000000001"))
      .toBe("30000000-0000-4000-8000-000000000001");
    expect(readActiveClubPreference("club-admin=true")).toBeNull();
    expect(readActiveClubPreference(undefined)).toBeNull();
  });

  it("uses a host-only, HttpOnly, same-site cookie", () => {
    expect(activeClubCookieName).toBe("rotary_active_club_v1");
    expect(activeClubCookieOptions({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: activeClubCookieMaxAgeSeconds,
    });
  });
});
