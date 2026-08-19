import type { NextRequest } from "next/server";
import { parseBlessingIouManagementContext } from "@/lib/blessing-iou/contracts";
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
  parseBlessingSettingBody,
} from "@/lib/blessing-iou/validation";

export async function PATCH(request: NextRequest) {
  if (!blessingIouMutationAllowed(request)) return blessingIouFailure(403);
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const body = parseBlessingSettingBody(await readBlessingIouJson(request));
    const { data, error } = await client.rpc("set_blessing_iou_amount_visibility", {
      p_club_id: clubId,
      p_allow_public_amounts: body.allowPublicAmounts,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess(parseBlessingIouManagementContext(data));
  } catch {
    return blessingIouFailure(400);
  }
}
