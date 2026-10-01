import { NextResponse } from "next/server";
import { getApplicationBuildId } from "@/lib/app-build-id";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Public build metadata only; unlike the health endpoint this never probes Supabase. */
export function GET() {
  return NextResponse.json(
    { buildId: getApplicationBuildId() },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
