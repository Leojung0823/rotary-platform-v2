export const activeClubCookieName = "rotary_active_club_v1";
export const activeClubCookieMaxAgeSeconds = 60 * 60 * 24 * 30;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function readActiveClubPreference(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

export function activeClubCookieOptions(environment: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // The CI browser runs a production Next build against a local HTTP
    // server. APP_ENV describes the site boundary; NODE_ENV only describes
    // how Next was built and must not make local HTTP cookies unusable.
    secure: environment.APP_ENV === "staging"
      || environment.APP_ENV === "production"
      || (!environment.APP_ENV && environment.NODE_ENV === "production"),
    path: "/",
    maxAge: activeClubCookieMaxAgeSeconds,
  };
}
