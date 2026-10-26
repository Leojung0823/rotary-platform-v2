import type { NextRequest } from "next/server";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyPinBody, parseJoyPostId } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ postId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const isPinned = parseJoyPinBody(await readJoyJson(request));
    const { data, error } = await client.rpc("set_joy_post_pinned", {
      p_club_id: clubId,
      p_post_id: postId,
      p_is_pinned: isPinned,
    });
    if (error) return joyRpcFailure(error);
    if (!data || typeof data !== "object" || data.is_pinned !== isPinned
      || (data.pinned_at !== null && typeof data.pinned_at !== "string")) return joyFailure(500);
    return joySuccess({ is_pinned: data.is_pinned, pinned_at: data.pinned_at });
  } catch {
    return joyFailure(400);
  }
}
