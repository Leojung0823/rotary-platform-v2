import type { NextRequest } from "next/server";
import { parseJoyPostDraft, parseJoyPostDrafts } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyPostDraftBody } from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { data, error } = await client.rpc("list_my_joy_post_drafts", { p_club_id: clubId });
    if (error) return joyRpcFailure(error);
    return joySuccess({ drafts: parseJoyPostDrafts(data) });
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
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const body = parseJoyPostDraftBody(await readJoyJson(request));
    const { data, error } = await client.rpc("save_my_joy_post_draft", {
      p_club_id: clubId,
      p_draft_id: body.draftId,
      p_post_type: body.postType,
      p_title: body.title,
      p_content: body.content,
      p_visibility_scope: body.visibilityScope,
      p_audience_membership_ids: body.audienceMembershipIds,
      p_event_ids: body.eventIds,
      p_rotary_year_ids: body.rotaryYearIds,
      p_role_keys: body.roleKeys,
      p_birthday_campaign_ids: body.birthdayCampaignIds,
      p_interaction_deadline_on: body.interactionDeadlineOn,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyPostDraft(data));
  } catch {
    return joyFailure(400);
  }
}
