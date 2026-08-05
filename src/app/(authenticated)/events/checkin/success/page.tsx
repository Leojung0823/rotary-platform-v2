import Link from "next/link";
import { notFound } from "next/navigation";
import { FocusHeading } from "@/components/focus-heading";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime, formatTime } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type Receipt = { attendance_id: string; event_id: string; title: string; location: string; starts_at: string; checked_in_at: string; checkin_method: string };

function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.attendance_id === "string" && typeof receipt.event_id === "string"
    && typeof receipt.title === "string" && typeof receipt.checked_in_at === "string";
}

export default async function CheckinSuccessPage({ searchParams }: { searchParams: Promise<{ attendanceId?: string }> }) {
  await requireIdentity();
  const query = await searchParams;
  if (!query.attendanceId) notFound();
  const supabase = await createClient();
  const result = await supabase.rpc("get_my_attendance_receipt", { p_attendance_id: query.attendanceId });
  if (result.error || !isReceipt(result.data)) notFound();
  const receipt = result.data;
  return <div className="page-stack narrow">
    <section className="success-result success-result-page" role="status" aria-live="assertive">
      <span className="success-check" aria-hidden="true">✓</span>
      <FocusHeading>簽到成功</FocusHeading>
      <h2>{receipt.title}</h2>
      <p>{formatDateTime(receipt.starts_at, true)}</p>
      {receipt.location && <p>{receipt.location}</p>}
      <p><strong>{formatTime(receipt.checked_in_at)} 已完成簽到</strong></p>
      <Link className="button" href={`/events/${receipt.event_id}`}>返回活動</Link>
    </section>
  </div>;
}
