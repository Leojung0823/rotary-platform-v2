import type { NextRequest } from "next/server";
import { parseJoyPost } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseCreateJoyIouBody, parseJoyClubId } from "@/lib/joy-wall/validation";

export async function POST(request: NextRequest) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const body = parseCreateJoyIouBody(await readJoyJson(request));
    const { data, error } = await client.rpc("create_joy_iou", {
      p_club_id: clubId,
      p_recipient_membership_id: body.recipientMembershipId,
      p_title: body.title,
      p_content: body.content,
      p_due_on: body.dueOn,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyPost(data), 201);
  } catch {
    return joyFailure(400);
  }
}
