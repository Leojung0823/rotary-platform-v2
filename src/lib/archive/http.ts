import { NextResponse, type NextRequest } from "next/server";

export const archiveNoStoreHeaders = { "Cache-Control": "no-store" } as const;

export function archiveFailure(status: number, code = "request_failed") {
  return NextResponse.json({ error: code }, { status, headers: archiveNoStoreHeaders });
}

export function archiveMutationAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  if (!origin) return fetchSite === "same-origin";
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    } catch {
      return false;
    }
  }
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function archiveRpcStatus(error: { code?: string | null } | null) {
  if (error?.code === "22023") return 400;
  if (error?.code === "P0002") return 404;
  if (error?.code === "42501") return 403;
  if (error?.code === "55000" || error?.code === "23505") return 409;
  return 500;
}
