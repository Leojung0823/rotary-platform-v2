import type { NextRequest } from "next/server";
import { parseJoyPost } from "@/lib/joy-wall/contracts";
import {
  authenticatedJoyClient,
  joyDeleteHasNoBody,
  joyFailure,
  joyMutationAllowed,
  joyRpcFailure,
  joySuccess,
  readJoyJson,
} from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyPostId, parseUpdateJoyPostBody } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ postId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const body = parseUpdateJoyPostBody(await readJoyJson(request));
    const { data, error } = await client.rpc("update_own_joy_post", {
      p_club_id: clubId, p_post_id: postId, p_post_type: body.postType,
      p_title: body.title, p_content: body.content,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyPost(data));
  } catch {
    return joyFailure(400);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    if (!await joyDeleteHasNoBody(request)) return joyFailure(400);
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const { error } = await client.rpc("archive_own_joy_post", { p_club_id: clubId, p_post_id: postId });
    if (error) return joyRpcFailure(error);
    return joySuccess({ archived: true });
  } catch {
    return joyFailure(400);
  }
}
