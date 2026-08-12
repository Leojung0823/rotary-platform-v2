import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_SESSION_PATHS = [
  "/board",
  "/club",
  "/clubs",
  "/dashboard",
  "/directory",
  "/events",
  "/features",
  "/me",
  "/platform",
  "/invite/accept",
  "/join",
  "/reset-password",
] as const;

export function shouldRefreshAuthSession(pathname: string) {
  return AUTH_SESSION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return loginRedirectResponse(request, response);
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
    return loginRedirectResponse(request, response);
  }
  const { data, error } = claimsResult;
  if (error || !data?.claims?.sub) return loginRedirectResponse(request, response);
  response.headers.set("Server-Timing", `auth;dur=${(performance.now() - startedAt).toFixed(1)}`);
  return response;
}

export const config = {
  matcher: [
    "/board/:path*",
    "/club/:path*",
    "/clubs/:path*",
    "/dashboard/:path*",
    "/directory/:path*",
    "/events/:path*",
    "/features/:path*",
    "/me/:path*",
    "/platform/:path*",
    "/invite/accept",
    "/join",
    "/reset-password",
  ],
};
