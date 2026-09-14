import type { NextRequest } from "next/server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { parseDuesFinanceReport } from "@/lib/dues-finance/reporting-contracts";
import { parseDuesFinanceReportUuid } from "@/lib/dues-finance/reporting-validation";
import {
  authenticatedDuesFinanceClient,
  duesFinanceFailure,
  duesFinanceRpcFailure,
  duesFinanceSuccess,
} from "@/lib/dues-finance/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { client, user } = await authenticatedDuesFinanceClient();
  if (!user) return duesFinanceFailure(401);
  const evaluation = await evaluateCurrentFeatureFlag({ key: "dues_finance_v1", subjectUuid: user.id });
  if (!evaluation.enabled) return duesFinanceFailure(404);
  let clubId: string;
  let rotaryYearId: string;
  try {
    clubId = parseDuesFinanceReportUuid(request.nextUrl.searchParams.get("club_id"));
    rotaryYearId = parseDuesFinanceReportUuid(request.nextUrl.searchParams.get("year_id"));
  } catch {
    return duesFinanceFailure(400);
  }
  const { data, error } = await client.rpc("get_club_dues_finance_report", {
    p_club_id: clubId,
    p_rotary_year_id: rotaryYearId,
  });
  if (error) return duesFinanceRpcFailure(error);
  try {
    return duesFinanceSuccess(parseDuesFinanceReport(data));
  } catch {
    return duesFinanceFailure(500);
  }
}
