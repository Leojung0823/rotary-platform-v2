import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that require an authenticated session: anonymous visitors are
// redirected to /login before the (authenticated) layout's Suspense
// fallback can stream a 200.
export const PROTECTED_SESSION_PATHS = [
  "/archives",
  "/birthdays",
  "/board",
  "/club",
  "/clubs",
  "/dashboard",
  "/directory",
  "/events",
  "/features",
  "/me",
  "/messages",
  "/platform",
] as const;

// Anonymous-first pages, outside the (authenticated) layout entirely: they
// exist specifically for visitors who have never had a session (accepting
// an invite, resetting a password). They still benefit from an opportunistic
// refresh for an already-logged-in visitor, but must never be redirected to
// /login just for lacking one — that would make invitation links unusable.
export const SESSION_REFRESH_ONLY_PATHS = ["/invite/accept", "/join", "/reset-password"] as const;

const AUTH_SESSION_PATHS = [...PROTECTED_SESSION_PATHS, ...SESSION_REFRESH_ONLY_PATHS] as const;

export function shouldRefreshAuthSession(pathname: string) {
  return AUTH_SESSION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function requiresSession(pathname: string) {
  return PROTECTED_SESSION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function buildForwardedRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  // These are proxy-derived display inputs. Never preserve browser-supplied
  // values, and never use them as authorization inputs.
  headers.set("x-rotary-pathname", request.nextUrl.pathname);
  headers.set("x-rotary-requested-mode", request.nextUrl.searchParams.get("mode") ?? "");
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

  const redirectResponse = NextResponse.redirect(loginUrl);
  refreshedResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
    redirectResponse.cookies.set(name, value, options);
  });
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
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

// Next requires a statically analysable matcher, so this repeats the lists
// above rather than deriving from them. A path present in one and missing from
// the other silently loses its protection -- the middleware simply never runs
// for it -- so `proxy.test.ts` asserts the two stay in step.
export const config = {
  matcher: [
    "/archives/:path*",
    "/birthdays/:path*",
    "/board/:path*",
    "/club/:path*",
    "/clubs/:path*",
    "/dashboard/:path*",
    "/directory/:path*",
    "/events/:path*",
    "/features/:path*",
    "/me/:path*",
    "/messages/:path*",
    "/platform/:path*",
    "/invite/accept",
    "/join",
    "/reset-password",
  ],
};
