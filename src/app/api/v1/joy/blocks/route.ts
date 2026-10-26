import type { NextRequest } from "next/server";
import { parseJoyMemberBlockResult, parseJoyMemberBlocks } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyMemberBlockBody } from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { data, error } = await client.rpc("list_my_joy_member_blocks", { p_club_id: clubId });
    if (error) return joyRpcFailure(error);
    return joySuccess({ blocked_members: parseJoyMemberBlocks(data) });
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
    const body = parseJoyMemberBlockBody(await readJoyJson(request));
    const { data, error } = await client.rpc("set_my_joy_member_block", {
      p_club_id: clubId,
      p_target_membership_id: body.membershipId,
      p_blocked: body.blocked,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyMemberBlockResult(data));
  } catch {
    return joyFailure(400);
  }
}
