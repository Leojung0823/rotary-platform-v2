import type { NextRequest } from "next/server";
import { parseJoyReports } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyModerationBody, parseJoyPostId } from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { data, error } = await client.rpc("list_joy_reports", { p_club_id: clubId, p_limit: 50 });
    if (error) return joyRpcFailure(error);
    return joySuccess({ reports: parseJoyReports(data) });
  } catch {
    return joyFailure(400);
  }
}

export async function POST(request: NextRequest) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const bodyValue = await readJoyJson(request);
    if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue)) return joyFailure(400);
    const body = bodyValue as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["clubId", "reportId", "action", "reviewerNote"].includes(key))) return joyFailure(400);
    const clubId = parseJoyClubId(typeof body.clubId === "string" ? body.clubId : null);
    const reportId = parseJoyPostId(typeof body.reportId === "string" ? body.reportId : "");
    const moderation = parseJoyModerationBody({ action: body.action, reviewerNote: body.reviewerNote });
    const { error } = await client.rpc("resolve_joy_report", {
      p_club_id: clubId, p_report_id: reportId,
      p_action: moderation.action, p_reviewer_note: moderation.reviewerNote,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess({ resolved: true });
  } catch {
    return joyFailure(400);
  }
}
