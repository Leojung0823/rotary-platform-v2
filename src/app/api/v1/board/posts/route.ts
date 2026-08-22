import type { NextRequest } from "next/server";
import { parseBoardListProjection, parseBoardPostProjection } from "@/lib/message-board/contracts";
import {
  authenticatedBoardClient,
  boardFailure,
  boardRpcFailure,
  boardSuccess,
  mutationAllowed,
  readBoardJson,
} from "@/lib/message-board/http";
import {
  decodeBoardCursor,
  encodeBoardCursor,
  parseBoardClubId,
  parseBoardCreateBody,
  parseBoardLimit,
} from "@/lib/message-board/validation";

export async function GET(request: NextRequest) {
  const { client, user } = await authenticatedBoardClient();
  if (!user) return boardFailure(401);

  try {
    const clubId = parseBoardClubId(request.nextUrl.searchParams.get("club_id"));
    const limit = parseBoardLimit(request.nextUrl.searchParams.get("limit"));
    const cursor = decodeBoardCursor(request.nextUrl.searchParams.get("cursor"));
    const { data, error } = await client.rpc("list_board_posts", {
      p_club_id: clubId,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit,
    });
    if (error) return boardRpcFailure(error);

    const projection = parseBoardListProjection(data);
    return boardSuccess({
      posts: projection.posts,
      next_cursor: encodeBoardCursor(projection.nextCursorPayload),
    });
  } catch {
    return boardFailure(400);
  }
}

export async function POST(request: NextRequest) {
  if (!mutationAllowed(request)) return boardFailure(403);
  const { client, user } = await authenticatedBoardClient();
  if (!user) return boardFailure(401);

  try {
    const clubId = parseBoardClubId(request.nextUrl.searchParams.get("club_id"));
    const body = parseBoardCreateBody(await readBoardJson(request));
    const { data, error } = await client.rpc("create_board_post", {
      p_club_id: clubId,
      p_content: body.content,
      p_tag_ids: body.tagIds,
    });
    if (error) return boardRpcFailure(error);
    return boardSuccess(parseBoardPostProjection(data), 201);
  } catch {
    return boardFailure(400);
  }
}
