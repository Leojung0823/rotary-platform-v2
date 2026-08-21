import { NextResponse, type NextRequest } from "next/server";
import {
  attendanceCsvFilename,
  isAttendanceCsvExport,
  serializeAttendanceCsv,
} from "@/lib/attendance/csv";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clubId: string }> },
) {
  const { clubId } = await context.params;
  const eventId = request.nextUrl.searchParams.get("eventId") ?? "";
  if (!uuidPattern.test(clubId) || !uuidPattern.test(eventId)) {
    return NextResponse.json({ error: "request_failed" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "request_failed" }, { status: 401 });

  // Authorization lives entirely in the RPC: it requires attendance.manage on
  // this club and that the event belongs to it. This route never widens that.
  const { data, error } = await supabase.rpc("export_event_attendance_csv", {
    p_club_id: clubId,
    p_event_id: eventId,
  });
  if (error) {
    const status = error.message?.includes("attendance_manage_required") ? 403 : 400;
    return NextResponse.json({ error: "request_failed" }, { status });
  }
  if (!isAttendanceCsvExport(data)) {
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }

  const firstRow = data.rows[0] ?? {};
  const filename = attendanceCsvFilename(
    typeof firstRow.event_date === "string" ? firstRow.event_date : null,
    typeof firstRow.event_title === "string" ? firstRow.event_title : null,
  );

  return new NextResponse(serializeAttendanceCsv(data), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // The filename is derived from an event title, so it is sent only in the
      // RFC 5987 form and percent-encoded rather than interpolated raw.
      "content-disposition": `attachment; filename="attendance.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
