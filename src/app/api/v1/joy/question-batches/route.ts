import type { NextRequest } from "next/server";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyQuestionBatchBody } from "@/lib/joy-wall/validation";

export async function POST(request: NextRequest) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const body = parseJoyQuestionBatchBody(await readJoyJson(request));
    const { data, error } = await client.rpc("dispatch_joy_question_batch_with_deadline", {
      p_club_id: clubId,
      p_title: body.title,
      p_recipient_membership_ids: body.recipientMembershipIds,
      p_request_id: body.requestId,
      p_due_on: body.dueOn,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(data, 201);
  } catch {
    return joyFailure(400);
  }
}
