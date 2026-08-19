import type { NextRequest } from "next/server";
import { parseBlessingIouEntry, parseBlessingIouListProjection } from "@/lib/blessing-iou/contracts";
import {
  authenticatedBlessingIouClient,
  blessingIouFailure,
  blessingIouMutationAllowed,
  blessingIouRpcFailure,
  blessingIouSuccess,
  readBlessingIouJson,
} from "@/lib/blessing-iou/http";
import {
  decodeBlessingCursor,
  encodeBlessingCursor,
  parseBlessingClubId,
  parseBlessingEntryBody,
  parseBlessingLimit,
} from "@/lib/blessing-iou/validation";

export async function GET(request: NextRequest) {
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const limit = parseBlessingLimit(request.nextUrl.searchParams.get("limit"));
    const cursor = decodeBlessingCursor(request.nextUrl.searchParams.get("cursor"));
    const { data, error } = await client.rpc("list_blessing_iou_entries", {
      p_club_id: clubId,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit,
    });
    if (error) return blessingIouRpcFailure(error);
    const projection = parseBlessingIouListProjection(data);
    return blessingIouSuccess({
      entries: projection.entries,
      next_cursor: encodeBlessingCursor(projection.nextCursorPayload),
      viewer_can_manage: projection.viewerCanManage,
    });
  } catch {
    return blessingIouFailure(400);
  }
}

export async function POST(request: NextRequest) {
  if (!blessingIouMutationAllowed(request)) return blessingIouFailure(403);
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const body = parseBlessingEntryBody(await readBlessingIouJson(request));
    const { data, error } = await client.rpc("create_blessing_iou_entry", {
      p_club_id: clubId,
      p_blessing_text: body.blessingText,
      p_pledged_amount: body.pledgedAmount,
      p_hide_amount: body.hideAmount,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess(parseBlessingIouEntry(data), 201);
  } catch {
    return blessingIouFailure(400);
  }
}
