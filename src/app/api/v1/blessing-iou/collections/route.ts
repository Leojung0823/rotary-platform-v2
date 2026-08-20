import type { NextRequest } from "next/server";
import { parseBlessingIouCollectionContext } from "@/lib/blessing-iou/collections-contracts";
import {
  parseCollectionBatchBody,
  parseCollectionPeriodMonth,
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

export async function GET(request: NextRequest) {
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const periodMonth = parseCollectionPeriodMonth(request.nextUrl.searchParams.get("month"));
    const { data, error } = await client.rpc("get_blessing_iou_collection_context", {
      p_club_id: clubId,
      p_period_month: periodMonth,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess(parseBlessingIouCollectionContext(data));
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
    const body = parseCollectionBatchBody(await readBlessingIouJson(request));
    const { data, error } = await client.rpc("record_blessing_iou_collections", {
      p_club_id: clubId,
      p_period_month: body.periodMonth,
      p_received_on: body.receivedOn,
      p_payment_method: body.paymentMethod,
      p_reference_note: body.referenceNote,
      p_items: body.items,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess(parseBlessingIouCollectionContext(data), 201);
  } catch {
    return blessingIouFailure(400);
  }
}
