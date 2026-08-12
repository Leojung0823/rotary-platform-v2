import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight liveness response for external uptime monitors.
 *
 * Unlike /api/health, this route deliberately does not inspect configuration
 * or contact Supabase, so it can safely wake an idle Render instance.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        "cache-control": "no-store, max-age=0",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
