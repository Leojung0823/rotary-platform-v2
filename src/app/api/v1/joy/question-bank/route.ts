import type { NextRequest } from "next/server";
import { parseJoyQuestionManagerPage, parseJoyQuestionPrompt } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import {
  parseCreateJoyQuestionPromptBody,
  parseJoyClubId,
} from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { data, error } = await client.rpc("get_joy_question_manager_page", { p_club_id: clubId });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyQuestionManagerPage(data));
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
    const body = parseCreateJoyQuestionPromptBody(await readJoyJson(request));
    const { data, error } = await client.rpc("create_joy_question_prompt", {
      p_club_id: clubId,
      p_prompt_text: body.promptText,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess(parseJoyQuestionPrompt(data), 201);
  } catch {
    return joyFailure(400);
  }
}
