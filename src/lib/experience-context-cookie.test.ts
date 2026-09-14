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
    expect(activeClubCookieOptions({ APP_ENV: "production", NODE_ENV: "production" } as NodeJS.ProcessEnv)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: activeClubCookieMaxAgeSeconds,
    });
  });

  it("does not mark local HTTP cookies Secure when Next uses a production build", () => {
    expect(activeClubCookieOptions({ APP_ENV: "local", NODE_ENV: "production" } as NodeJS.ProcessEnv).secure)
      .toBe(false);
  });

  it("marks staging cookies Secure", () => {
    expect(activeClubCookieOptions({ APP_ENV: "staging", NODE_ENV: "production" } as NodeJS.ProcessEnv).secure)
      .toBe(true);
  });
});
