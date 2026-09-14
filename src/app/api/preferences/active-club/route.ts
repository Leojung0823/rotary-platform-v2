import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  activeClubCookieName,
  activeClubCookieOptions,
  readActiveClubPreference,
} from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { resolveActiveClubPreferenceChange } from "@/lib/experience-context";
import { isSameOriginMutation } from "@/lib/api/json-request";

function redirectTo(request: Request, pathname: string) {
  return NextResponse.redirect(new URL(pathname, request.url), 303);
}

/**
 * A native same-origin POST is used for this preference instead of an
 * enhanced Server Action form. The browser must commit the HttpOnly cookie
 * before the following page request resolves its active club.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation({
    requestOrigin: request.nextUrl.origin,
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  })) return redirectTo(request, "/access-denied");

  const formData = await request.formData();
  const cookieStore = await cookies();
  const resolution = await resolveExperienceContext(
    readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value),
  );
  if (!resolution.ok) return redirectTo(request, "/access-denied");

  const preference = resolveActiveClubPreferenceChange(
    resolution.context,
    formData.get("mode"),
    readActiveClubPreference(formData.get("clubId")),
  );
  const target = new URL("/dashboard", request.url);
  target.searchParams.set("mode", preference.mode);
  const response = NextResponse.redirect(target, 303);
  if (preference.clubId) {
    response.cookies.set(
      activeClubCookieName,
      preference.clubId,
      activeClubCookieOptions(),
    );
  } else {
    response.cookies.delete(activeClubCookieName);
  }
  return response;
}
