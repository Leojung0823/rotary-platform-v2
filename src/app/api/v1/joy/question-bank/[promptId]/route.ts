import type { NextRequest } from "next/server";
import { parseJoyQuestionPrompt } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import {
  parseJoyClubId,
  parseJoyQuestionPromptId,
  parseUpdateJoyQuestionPromptBody,
} from "@/lib/joy-wall/validation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ promptId: string }> }) {
  if (!joyMutationAllowed(request)) return joyFailure(403);
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { promptId: rawPromptId } = await params;
    const promptId = parseJoyQuestionPromptId(rawPromptId);
    const body = parseUpdateJoyQuestionPromptBody(await readJoyJson(request));
    const { data, error } = await client.rpc("update_joy_question_prompt", {
      p_club_id: clubId,
      p_prompt_id: promptId,
      p_prompt_text: body.promptText,
      p_is_active: body.isActive,
      p_sort_order: body.sortOrder,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyQuestionPrompt(data));
  } catch {
    return joyFailure(400);
  }
}
