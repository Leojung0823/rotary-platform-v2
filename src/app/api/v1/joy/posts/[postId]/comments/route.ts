import type { NextRequest } from "next/server";
import { parseJoyComments, parseJoyComment } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyPostId, parseJoyCommentBody } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ postId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const { data, error } = await client.rpc("list_joy_comments", {
      p_club_id: clubId, p_post_id: postId, p_limit: 100,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess({ comments: parseJoyComments(data) });
  } catch {
    return joyFailure(400);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const body = parseJoyCommentBody(await readJoyJson(request));
    const { data, error } = await client.rpc("create_joy_comment", {
      p_club_id: clubId, p_post_id: postId, p_parent_comment_id: body.parentCommentId,
      p_comment_type: body.commentType, p_content: body.content,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyComment(data), 201);
  } catch {
    return joyFailure(400);
  }
}
