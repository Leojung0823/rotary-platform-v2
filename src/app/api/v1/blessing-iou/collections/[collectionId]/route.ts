import type { NextRequest } from "next/server";
import { parseBlessingIouCollectionContext } from "@/lib/blessing-iou/collections-contracts";
import {
  parseCollectionId,
  parseCollectionReversalBody,
} from "@/lib/blessing-iou/collections-validation";
import {
  authenticatedBlessingIouClient,
  blessingIouFailure,
  blessingIouMutationAllowed,
  blessingIouRpcFailure,
  blessingIouSuccess,
  readBlessingIouJson,
} from "@/lib/blessing-iou/http";
import { parseBlessingClubId } from "@/lib/blessing-iou/validation";

type RouteContext = { params: Promise<{ collectionId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!blessingIouMutationAllowed(request)) return blessingIouFailure(403);
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const collectionId = parseCollectionId((await context.params).collectionId);
    const body = parseCollectionReversalBody(await readBlessingIouJson(request));
    const { data, error } = await client.rpc("reverse_blessing_iou_collection", {
      p_club_id: clubId,
      p_collection_id: collectionId,
      p_period_month: body.periodMonth,
      p_reason: body.reason,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess(parseBlessingIouCollectionContext(data));
  } catch {
    return blessingIouFailure(400);
  }
}
