import type { NextRequest } from "next/server";
import { parseJoyQuestionBatchDetail } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyRpcFailure, joySuccess } from "@/lib/joy-wall/http";
import { parseJoyClubId, parseJoyQuestionBatchId } from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { batchId: rawBatchId } = await params;
    const batchId = parseJoyQuestionBatchId(rawBatchId);
    const { data, error } = await client.rpc("get_joy_question_batch_detail", {
      p_club_id: clubId,
      p_batch_id: batchId,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyQuestionBatchDetail(data));
  } catch {
    return joyFailure(400);
  }
}
