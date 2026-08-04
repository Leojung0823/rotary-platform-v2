import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function sessionResponse(authenticated: boolean) {
  return NextResponse.json({ authenticated }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    return sessionResponse(!error && Boolean(data?.claims?.sub));
  } catch {
    return sessionResponse(false);
  }
}
