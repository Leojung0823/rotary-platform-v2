import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that require an authenticated session: anonymous visitors are
// redirected to /login before the (authenticated) layout's Suspense
// fallback can stream a 200.
export const PROTECTED_SESSION_PATHS = [
  "/archives",
  "/attendance",
  "/birthday-collection",
  "/birthdays",
  "/blessings",
  "/board",
  "/club",
  "/club-affairs",
  "/clubs",
  "/dashboard",
  "/directory",
  "/dues",
  "/events",
  "/features",
  "/interact",
  "/joy",
  "/me",
  "/messages",
  "/platform",
  "/search",
  "/tasks",
  "/topics",
] as const;

// Anonymous-first pages, outside the (authenticated) layout entirely: they
// exist specifically for visitors who have never had a session (accepting
// an invite, resetting a password). They still benefit from an opportunistic
// refresh for an already-logged-in visitor, but must never be redirected to
// /login just for lacking one — that would make invitation links unusable.
export const SESSION_REFRESH_ONLY_PATHS = ["/invite/accept", "/join", "/reset-password"] as const;

const AUTH_SESSION_PATHS = [...PROTECTED_SESSION_PATHS, ...SESSION_REFRESH_ONLY_PATHS] as const;
const clubIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function shouldRefreshAuthSession(pathname: string) {
  return AUTH_SESSION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function requiresSession(pathname: string) {
  return PROTECTED_SESSION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function buildForwardedRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  const pathClubId = /^\/clubs?\/([^/]+)/u.exec(request.nextUrl.pathname)?.[1];
  const queryClubId = request.nextUrl.searchParams.get("clubId");
  const requestedClubId = pathClubId ?? queryClubId;
  // These are proxy-derived display inputs. Never preserve browser-supplied
  // values, and never use them as authorization inputs.
  headers.set("x-rotary-pathname", request.nextUrl.pathname);
  headers.set("x-rotary-requested-mode", request.nextUrl.searchParams.get("mode") ?? "");
  headers.set(
    "x-rotary-requested-club-id",
    requestedClubId && clubIdPattern.test(requestedClubId) ? requestedClubId.toLowerCase() : "",
  );
  return headers;
}

function forwardedResponse(request: NextRequest) {
  return NextResponse.next({ request: { headers: buildForwardedRequestHeaders(request) } });
}

function loginRedirectResponse(request: NextRequest, refreshedResponse: NextResponse) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.hash = "";
  loginUrl.searchParams.set("returnTo", request.nextUrl.pathname + request.nextUrl.search);

  const redirectResponse = NextResponse.redirect(loginUrl);
  refreshedResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
    redirectResponse.cookies.set(name, value, options);
  });
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const userAgent = request.headers.get("user-agent") ?? "";
  const destination = request.headers.get("sec-fetch-dest");
  const isPageNavigation = request.method === "GET"
    && (!destination || destination === "document")
    && !request.headers.has("rsc") && !request.headers.has("next-router-prefetch")
    && !request.headers.has("next-action")
    && (!request.headers.has("accept") || request.headers.get("accept")!.includes("text/html"));
  const excluded = /^\/(?:api|_next|auth)(?:\/|$)/iu.test(pathname)
    || /\.(?:avif|css|gif|ico|jpe?g|js|json|map|png|svg|webmanifest|webp|woff2?)$/iu.test(pathname)
    || pathname === "/manifest";
  if (isPageNavigation && !excluded && /Line\//iu.test(userAgent) && !/LIFF/iu.test(userAgent)
      && !request.nextUrl.searchParams.has("openExternalBrowser")) {
    const target = request.nextUrl.clone();
    target.searchParams.set("openExternalBrowser", "1");
    const redirect = NextResponse.redirect(target);
    redirect.headers.set("Cache-Control", "private, no-store");
    redirect.headers.set("Vary", "User-Agent");
    return redirect;
  }
  let response = forwardedResponse(request);
  if (!shouldRefreshAuthSession(request.nextUrl.pathname)) return response;

  const mustHaveSession = requiresSession(request.nextUrl.pathname);
  const failClosed = () => (mustHaveSession ? loginRedirectResponse(request, response) : response);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return failClosed();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        // Rebuild from the mutated request. Reusing a pre-refresh Headers
        // snapshot would drop the refreshed session from this request's
        // downstream Server Component Cookie header.
        response = forwardedResponse(request);
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const startedAt = performance.now();
  let claimsResult;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    return failClosed();
  }
  const { data, error } = claimsResult;
  if (error || !data?.claims?.sub) return failClosed();
  response.headers.set("Server-Timing", `auth;dur=${(performance.now() - startedAt).toFixed(1)}`);
  return response;
}

// Include public page routes as well as protected pages, while keeping static
// assets and API calls out of the proxy. Auth callbacks are excluded in code.
export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|.*\\.(?:avif|css|gif|ico|jpe?g|js|json|map|png|svg|webmanifest|webp|woff2?)$).*)"],
};
