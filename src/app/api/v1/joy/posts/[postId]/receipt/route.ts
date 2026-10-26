import type { NextRequest } from "next/server";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyPostId } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ postId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const { data, error } = await client.rpc("acknowledge_joy_post_receipt", {
      p_club_id: clubId,
      p_post_id: postId,
    });
    if (error) return joyRpcFailure(error);
    if (!data || typeof data !== "object" || typeof data.acknowledged_at !== "string") return joyFailure(500);
    return joySuccess({ acknowledged_at: data.acknowledged_at });
  } catch {
    return joyFailure(400);
  }
}
