import type { NextRequest } from "next/server";
import { parseBlessingIouEntry } from "@/lib/blessing-iou/contracts";
import {
  authenticatedBlessingIouClient,
  blessingIouFailure,
  blessingIouMutationAllowed,
  blessingIouRpcFailure,
  blessingIouSuccess,
  readBlessingIouJson,
} from "@/lib/blessing-iou/http";
import {
  parseBlessingClubId,
  parseBlessingDeleteBody,
  parseBlessingEntryBody,
  parseBlessingEntryId,
} from "@/lib/blessing-iou/validation";

type RouteContext = { params: Promise<{ entryId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!blessingIouMutationAllowed(request)) return blessingIouFailure(403);
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const entryId = parseBlessingEntryId((await context.params).entryId);
    const body = parseBlessingEntryBody(await readBlessingIouJson(request));
    const { data, error } = await client.rpc("update_own_blessing_iou_entry", {
      p_club_id: clubId,
      p_entry_id: entryId,
      p_blessing_text: body.blessingText,
      p_pledged_amount: body.pledgedAmount,
      p_hide_amount: body.hideAmount,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess(parseBlessingIouEntry(data));
  } catch {
    return blessingIouFailure(400);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!blessingIouMutationAllowed(request)) return blessingIouFailure(403);
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const entryId = parseBlessingEntryId((await context.params).entryId);
    const body = parseBlessingDeleteBody(await readBlessingIouJson(request));
    const { error } = await client.rpc("delete_blessing_iou_entry", {
      p_club_id: clubId,
      p_entry_id: entryId,
      p_reason: body.reason,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess({ deleted: true });
  } catch {
    return blessingIouFailure(400);
  }
}
