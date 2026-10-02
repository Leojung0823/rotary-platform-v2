import type { NextRequest } from "next/server";
import { parseJoyQuestionRecipients } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyRpcFailure, joySuccess } from "@/lib/joy-wall/http";
import { parseJoyClubId } from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { data, error } = await client.rpc("list_joy_question_recipient_options", { p_club_id: clubId });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyQuestionRecipients(data));
  } catch {
    return joyFailure(400);
  }
}
