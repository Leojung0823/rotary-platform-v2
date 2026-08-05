import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_SESSION_PATHS = [
  "/announcements",
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

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!shouldRefreshAuthSession(request.nextUrl.pathname)) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const startedAt = performance.now();
  await supabase.auth.getClaims();
  response.headers.set("Server-Timing", `auth;dur=${(performance.now() - startedAt).toFixed(1)}`);
  return response;
}

export const config = {
  matcher: [
    "/announcements/:path*",
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
