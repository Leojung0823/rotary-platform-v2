import type { NextRequest } from "next/server";
import { parseBoardPostProjection } from "@/lib/message-board/contracts";
import {
  authenticatedBoardClient,
  boardFailure,
  boardRpcFailure,
  boardSuccess,
  deleteHasNoBody,
  mutationAllowed,
  readBoardJson,
} from "@/lib/message-board/http";
import { parseBoardContentBody, parseBoardPostId } from "@/lib/message-board/validation";

type RouteContext = { params: Promise<{ postId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!mutationAllowed(request)) return boardFailure(403);
  const { client, user } = await authenticatedBoardClient();
  if (!user) return boardFailure(401);

  try {
    const { postId } = await context.params;
    const id = parseBoardPostId(postId);
    const body = parseBoardContentBody(await readBoardJson(request));
    const { data, error } = await client.rpc("update_own_board_post", {
      p_post_id: id,
      p_content: body.content,
    });
    if (error) return boardRpcFailure(error);
    return boardSuccess(parseBoardPostProjection(data));
  } catch {
    return boardFailure(400);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!mutationAllowed(request)) return boardFailure(403);
  const { client, user } = await authenticatedBoardClient();
  if (!user) return boardFailure(401);

  try {
    if (!await deleteHasNoBody(request)) return boardFailure(400);
    const { postId } = await context.params;
    const id = parseBoardPostId(postId);
    const { error } = await client.rpc("delete_own_board_post", { p_post_id: id });
    if (error) return boardRpcFailure(error);
    return boardSuccess({ deleted: true });
  } catch {
    return boardFailure(400);
  }
}
