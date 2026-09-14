export const activeClubCookieName = "rotary_active_club_v1";
export const activeClubCookieMaxAgeSeconds = 60 * 60 * 24 * 30;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function readActiveClubPreference(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

function activeClubCookieIsSecure(environment: NodeJS.ProcessEnv) {
  if (environment.APP_ENV === "local") return false;
  if (environment.APP_ENV === "staging" || environment.APP_ENV === "production") return true;

  // A production Next build is also used by the local Browser Smoke server.
  // When APP_ENV is unavailable, the configured origin still distinguishes
  // that local HTTP server from a hosted HTTPS deployment.
  try {
    const protocol = new URL(environment.NEXT_PUBLIC_SITE_URL ?? "").protocol;
    if (protocol === "http:") return false;
    if (protocol === "https:") return true;
  } catch {
    // Fall back to the build mode only when there is no usable site origin.
  }

  return environment.NODE_ENV === "production";
}

export function activeClubCookieOptions(environment: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: activeClubCookieIsSecure(environment),
    path: "/",
    maxAge: activeClubCookieMaxAgeSeconds,
  };
}
