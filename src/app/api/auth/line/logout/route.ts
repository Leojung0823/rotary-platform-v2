import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { clearLineMvpCookies, isSameOriginLineRequest } from "../../../../../lib/line/security";
import { createClient } from "@/lib/supabase/server";

function logoutResponse(success: boolean, status = 200) {
  return NextResponse.json({ success }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginLineRequest(request)) return logoutResponse(false, 403);

  const store = await cookies();
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("LINE Login logout failed.");
    clearLineMvpCookies(store);
    return logoutResponse(true);
  } catch {
    clearLineMvpCookies(store);
    return logoutResponse(false, 500);
  }
}
