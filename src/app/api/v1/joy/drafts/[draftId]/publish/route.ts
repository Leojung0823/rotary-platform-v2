import type { NextRequest } from "next/server";
import { parseJoyPost } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyDraftId } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ draftId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const draftId = parseJoyDraftId((await context.params).draftId);
    const { data, error } = await client.rpc("publish_my_joy_post_draft", { p_club_id: clubId, p_draft_id: draftId });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyPost(data), 201);
  } catch {
    return joyFailure(400);
  }
}
