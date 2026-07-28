import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  clearLineMvpCookies,
  isSameOriginLineRequest,
  trustedLineRedirectUrl,
} from "../../../../../lib/line/security";
import { createClient } from "@/lib/supabase/server";

function logoutResponse(success: boolean, status = 200) {
  return NextResponse.json({ success }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function wantsBrowserRedirect(request: NextRequest) {
  const entries = [...request.nextUrl.searchParams.entries()];
  return entries.length === 1 && entries[0][0] === "redirect" && entries[0][1] === "1";
}

function logoutRedirect(success: boolean) {
  const response = NextResponse.redirect(
    trustedLineRedirectUrl(success ? "/login" : "/login?error=logout_failed"),
    303,
  );
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginLineRequest(request)) return logoutResponse(false, 403);

  const redirectAfterLogout = wantsBrowserRedirect(request);
  const store = await cookies();
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("LINE Login logout failed.");
    clearLineMvpCookies(store);
    return redirectAfterLogout ? logoutRedirect(true) : logoutResponse(true);
  } catch {
    clearLineMvpCookies(store);
    return redirectAfterLogout ? logoutRedirect(false) : logoutResponse(false, 500);
  }
}
