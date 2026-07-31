import { NextResponse } from "next/server";
import { buildAttendanceCsv, type AttendanceCsvRow } from "@/lib/attendance/csv";
import { parseAttendanceUuid } from "@/lib/attendance/validation";
import { createClient } from "@/lib/supabase/server";

function isCsvRow(value: unknown): value is AttendanceCsvRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.event_date === "string"
    && typeof row.event_title === "string"
    && typeof row.member_name === "string"
    && typeof row.final_status === "string"
    && (row.raw_checkin_method === null || typeof row.raw_checkin_method === "string")
    && (row.raw_checked_in_at === null || typeof row.raw_checked_in_at === "string")
    && (row.adjustment_type === null || typeof row.adjustment_type === "string")
    && (row.adjustment_reason === null || typeof row.adjustment_reason === "string");
}

export async function GET(request: Request, { params }: { params: Promise<{ clubId: string }> }) {
  let clubId: string;
  let eventId: string;
  try {
    clubId = parseAttendanceUuid((await params).clubId);
    eventId = parseAttendanceUuid(new URL(request.url).searchParams.get("eventId"));
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await supabase.rpc("export_event_attendance_csv", {
    p_club_id: clubId,
    p_event_id: eventId,
  });
  if (result.error) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const projection = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : null;
  const rows = projection?.rows;
  if (!Array.isArray(rows) || !rows.every(isCsvRow)) {
    return NextResponse.json({ error: "invalid_projection" }, { status: 502 });
  }

  return new NextResponse(buildAttendanceCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendance-${eventId}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
