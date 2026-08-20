import type { NextRequest } from "next/server";
import { parseBlessingIouRotaryYearReport } from "@/lib/blessing-iou/reporting-contracts";
import { parseRotaryYearStart } from "@/lib/blessing-iou/reporting-validation";
import {
  authenticatedBlessingIouClient,
  blessingIouFailure,
  blessingIouRpcFailure,
  blessingIouSuccess,
} from "@/lib/blessing-iou/http";
import { parseBlessingClubId } from "@/lib/blessing-iou/validation";

export async function GET(request: NextRequest) {
  const { client, user } = await authenticatedBlessingIouClient();
  if (!user) return blessingIouFailure(401);
  try {
    const clubId = parseBlessingClubId(request.nextUrl.searchParams.get("club_id"));
    const rotaryYearStart = parseRotaryYearStart(request.nextUrl.searchParams.get("year"));
    const { data, error } = await client.rpc("get_blessing_iou_rotary_year_report", {
      p_club_id: clubId,
      p_rotary_year_start: rotaryYearStart,
    });
    if (error) return blessingIouRpcFailure(error);
    return blessingIouSuccess(parseBlessingIouRotaryYearReport(data));
  } catch {
    return blessingIouFailure(400);
  }
}
