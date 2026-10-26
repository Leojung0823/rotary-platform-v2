import type { NextRequest } from "next/server";
import { parseJoySuggestions } from "@/lib/joy-wall/contracts";
import { authenticatedJoyClient, joyFailure, joyMutationAllowed, joyRpcFailure, joySuccess, readJoyJson } from "@/lib/joy-wall/http";
import { parseCreateJoySuggestionBody, parseJoyClubId } from "@/lib/joy-wall/validation";

export async function GET(request: NextRequest) {
  const { client, user, featureEnabled } = await authenticatedJoyClient();
  if (!user) return joyFailure(401);
  if (!featureEnabled) return joyFailure(404);
  try {
    const clubId = parseJoyClubId(request.nextUrl.searchParams.get("club_id"));
    const { data, error } = await client.rpc("list_joy_suggestions", { p_club_id: clubId, p_limit: 100 });
    if (error) return joyRpcFailure(error);
    return joySuccess({ suggestions: parseJoySuggestions(data) });
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
    const body = parseCreateJoySuggestionBody(await readJoyJson(request));
    const { error } = await client.rpc("create_joy_suggestion", {
      p_club_id: clubId,
      p_content: body.content,
    });
    if (error) return joyRpcFailure(error);
    return joySuccess({ submitted: true }, 201);
  } catch {
    return joyFailure(400);
  }
}
