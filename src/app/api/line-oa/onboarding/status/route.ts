import { NextResponse } from "next/server";
import { resolveLineOaOnboardingStatus } from "@/lib/line/oa-onboarding.server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

export async function GET(request: Request) {
  const clubId = new URL(request.url).searchParams.get("clubId");
  if (!clubId || !uuidPattern.test(clubId)) return response({ error: "invalid_input" }, 400);

  const resolution = await resolveLineOaOnboardingStatus(clubId);
  if (!resolution.ok) {
    return response(
      { error: resolution.reason },
      resolution.reason === "authorization_denied" ? 403 : 503,
    );
  }

  return response({
    connected: resolution.status.pairStatus === "paired",
    pairStatus: resolution.status.pairStatus,
  });
}
