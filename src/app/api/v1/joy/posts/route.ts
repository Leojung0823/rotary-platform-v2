import type { NextRequest } from "next/server";
import { parseJoyPosts, parseJoyPost } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import {
  decodeJoyCursor,
  encodeJoyCursor,
  parseCreateJoyPostBody,
  parseJoyClubId,
  parseJoyLimit,
} from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const limit = parseJoyLimit(request.nextUrl.searchParams.get("limit"));
    const cursor = decodeJoyCursor(request.nextUrl.searchParams.get("cursor"));
    const view = request.nextUrl.searchParams.get("view") ?? "all";
    if (view !== "all" && view !== "favorites") return joyFailure(400);
    const { data, error } = await client.rpc("list_joy_posts", {
      p_club_id: clubId,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit,
      p_favorites_only: view === "favorites",
    });
    if (error) return joyRpcFailure(error);
    const projection = parseJoyPosts(data);
    return joySuccess({ posts: projection.posts, next_cursor: encodeJoyCursor(projection.nextCursor) });
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
    const body = parseCreateJoyPostBody(await readJoyJson(request));
    const { data, error } = await client.rpc("create_joy_post", {
      p_club_id: clubId,
      p_post_type: body.postType,
      p_title: body.title,
      p_content: body.content,
      p_visibility_scope: body.visibilityScope,
      p_audience_membership_ids: body.audienceMembershipIds,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyPost(data), 201);
  } catch {
    return joyFailure(400);
  }
}
