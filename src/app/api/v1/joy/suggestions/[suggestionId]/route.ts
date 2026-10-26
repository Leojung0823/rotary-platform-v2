import type { NextRequest } from "next/server";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoySuggestionId, parseJoySuggestionReviewBody } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ suggestionId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const suggestionId = parseJoySuggestionId((await context.params).suggestionId);
    const body = parseJoySuggestionReviewBody(await readJoyJson(request));
    const { error } = await client.rpc("review_joy_suggestion", {
      p_club_id: clubId,
      p_suggestion_id: suggestionId,
      p_action: body.action,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess({ reviewed: true });
  } catch {
    return joyFailure(400);
  }
}
