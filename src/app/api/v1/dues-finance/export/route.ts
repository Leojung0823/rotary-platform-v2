import { NextResponse, type NextRequest } from "next/server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { parseDuesFinanceReport } from "@/lib/dues-finance/reporting-contracts";
import { duesFinanceReportFilename, serializeDuesFinanceReportCsv } from "@/lib/dues-finance/reporting-export";
import { renderDuesFinanceReportPdf } from "@/lib/dues-finance/reporting-pdf";
import { renderDuesFinanceReportXlsx } from "@/lib/dues-finance/reporting-xlsx";
import { parseDuesFinanceReportUuid } from "@/lib/dues-finance/reporting-validation";
import {
  authenticatedDuesFinanceClient,
  duesFinanceFailure,
  duesFinanceRpcFailure,
} from "@/lib/dues-finance/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportFormat = "csv" | "xlsx" | "pdf";

function parseFormat(value: string | null): ExportFormat {
  if (value === "csv" || value === "xlsx" || value === "pdf") return value;
  throw new Error("invalid_dues_finance_export_format");
}

function downloadHeaders(contentType: string, filename: string) {
  const extension = filename.endsWith(".xlsx") ? "xlsx" : filename.endsWith(".pdf") ? "pdf" : "csv";
  return {
    "content-type": contentType,
    "content-disposition": `attachment; filename="dues-finance.${extension}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "no-store",
  };
}

export async function GET(request: NextRequest) {
  const { client, user } = await authenticatedDuesFinanceClient();
  if (!user) return duesFinanceFailure(401);
  const evaluation = await evaluateCurrentFeatureFlag({ key: "dues_finance_v1", subjectUuid: user.id });
  if (!evaluation.enabled) return duesFinanceFailure(404);

  let clubId: string;
  let rotaryYearId: string;
  let format: ExportFormat;
  try {
    clubId = parseDuesFinanceReportUuid(request.nextUrl.searchParams.get("club_id"));
    rotaryYearId = parseDuesFinanceReportUuid(request.nextUrl.searchParams.get("year_id"));
    format = parseFormat(request.nextUrl.searchParams.get("format"));
  } catch {
    return duesFinanceFailure(400);
  }

  const { data, error } = await client.rpc("get_club_dues_finance_report", {
    p_club_id: clubId,
    p_rotary_year_id: rotaryYearId,
  });
  if (error) return duesFinanceRpcFailure(error);
  let report;
  try {
    report = parseDuesFinanceReport(data);
  } catch {
    return duesFinanceFailure(500);
  }

  const filename = duesFinanceReportFilename(report, format);
  if (format === "csv") {
    return new NextResponse(serializeDuesFinanceReportCsv(report), {
      headers: downloadHeaders("text/csv; charset=utf-8", filename),
    });
  }
  if (format === "pdf") {
    try {
      const pdf = await renderDuesFinanceReportPdf(report);
      return new NextResponse(new Uint8Array(pdf), {
        headers: downloadHeaders("application/pdf", filename),
      });
    } catch {
      return duesFinanceFailure(500);
    }
  }
  try {
    const xlsx = await renderDuesFinanceReportXlsx(report);
    return new NextResponse(new Uint8Array(xlsx), {
      headers: downloadHeaders("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename),
    });
  } catch {
    return duesFinanceFailure(500);
  }
}
