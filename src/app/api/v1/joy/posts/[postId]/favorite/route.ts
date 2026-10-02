import type { NextRequest } from "next/server";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyFavoriteBody, parseJoyClubId, parseJoyPostId } from "@/lib/joy-wall/validation";

type RouteContext = { params: Promise<{ postId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const postId = parseJoyPostId((await context.params).postId);
    const isFavorite = parseJoyFavoriteBody(await readJoyJson(request));
    const { data, error } = await client.rpc("set_joy_post_favorite", {
      p_club_id: clubId, p_post_id: postId, p_is_favorite: isFavorite,
    });
    if (error) return joyRpcFailure(error);
    if (data !== isFavorite) return joyFailure(500);
    return joySuccess({ is_favorited: data });
  } catch {
    return joyFailure(400);
  }
}
