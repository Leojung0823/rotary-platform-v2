import { NextResponse, type NextRequest } from "next/server";
import { archiveFailure, archiveNoStoreHeaders, archiveRpcStatus } from "@/lib/archive/http";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function cell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const clubId = String(request.nextUrl.searchParams.get("club_id") ?? "").toLowerCase();
  const yearId = String(request.nextUrl.searchParams.get("year_id") ?? "").toLowerCase();
  if (!uuidPattern.test(clubId) || !uuidPattern.test(yearId)) return archiveFailure(400);
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return archiveFailure(401);
  const exported = await supabase.rpc("export_archive_manifest", {
    p_club_id: clubId,
    p_rotary_year_id: yearId,
  });
  if (exported.error) return archiveFailure(archiveRpcStatus(exported.error));
  if (!exported.data || typeof exported.data !== "object" || Array.isArray(exported.data)) return archiveFailure(500);
  const projection = exported.data as { year?: unknown; items?: unknown };
  if (!projection.year || typeof projection.year !== "object" || !Array.isArray(projection.items)) return archiveFailure(500);
  const year = projection.year as Record<string, unknown>;
  const rows = [
    ["分類", "標題", "資料夾", "標籤", "保密級別", "版本數", "最新版本時間"],
    ...projection.items.map((entry) => {
      const item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      return [
        item.category,
        item.title,
        item.folder_path,
        Array.isArray(item.tags) ? item.tags.join("、") : "",
        item.confidentiality,
        item.version_count,
        item.latest_version_at,
      ];
    }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
  const startYear = Number.isInteger(year.start_year) ? Number(year.start_year) : "archive";
  return new NextResponse(csv, {
    headers: {
      ...archiveNoStoreHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rotary-archive-${startYear}.csv"`,
    },
  });
}
