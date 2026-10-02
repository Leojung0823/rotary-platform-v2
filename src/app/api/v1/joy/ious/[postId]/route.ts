import type { NextRequest } from "next/server";
import { parseJoyPost } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyIouActionBody, parseJoyPostId } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ postId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const body = parseJoyIouActionBody(await readJoyJson(request));
    const { data, error } = await client.rpc("act_joy_iou", {
      p_club_id: clubId,
      p_post_id: postId,
      p_action: body.action,
      p_note: body.note,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyPost(data));
  } catch {
    return joyFailure(400);
  }
}
