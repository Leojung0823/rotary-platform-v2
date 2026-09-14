import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventCreateForm } from "@/components/events/event-create-form";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { EventCreateFormValues } from "@/lib/events/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "編輯活動" };

const eventTypeLabels: Record<string, string> = {
  regular_meeting: "例會",
  board_meeting: "理監事會",
  service: "服務活動",
  joint_meeting: "聯合例會",
  fireside: "爐邊會",
  other: "其他",
};

type ManagedEvent = {
  event_id: string;
  version: number;
  status: string;
  event_type: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  capacity: number | null;
  counts_for_attendance: boolean;
  venue_latitude: number | null;
  venue_longitude: number | null;
};

/** datetime-local wants the club's wall clock, not an instant with a zone. */
function toLocalInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ clubId: string; eventId: string }>;
}) {
  const { clubId, eventId } = await params;
  const supabase = await createClient();

  const [eventsResult, tagsResult, membersResult] = await Promise.all([
    supabase.rpc("list_club_events", { p_club_id: clubId }),
    supabase.rpc("list_club_member_tags", { p_club_id: clubId }),
    supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: "active" }),
  ]);
  if (eventsResult.error) return <Notice tone="error">您沒有管理這個社活動的權限。</Notice>;

  const events = ((eventsResult.data as { events?: ManagedEvent[] } | null)?.events ?? []);
  const target = events.find((event) => event.event_id === eventId);
  if (!target) notFound();

  // The database refuses these too; refusing here saves the officer filling in
  // a form that can only be rejected.
  if (target.status !== "draft" && target.status !== "published") {
    return <div className="page-stack">
      <Notice tone="error">這場活動已取消或已結束，不能再編輯。</Notice>
      <Link className="button button-secondary" href={`/clubs/${clubId}/events?mode=management`}>← 回活動管理</Link>
    </div>;
  }

  const values: EventCreateFormValues = {
    eventType: target.event_type,
    title: target.title,
    startsAt: toLocalInput(target.starts_at),
    endsAt: toLocalInput(target.ends_at),
    registrationDeadline: toLocalInput(target.registration_deadline),
    capacity: target.capacity === null ? "" : String(target.capacity),
    location: target.location ?? "",
    venueLocation: target.venue_latitude !== null && target.venue_longitude !== null
      ? `${target.venue_latitude}, ${target.venue_longitude}`
      : "",
    countsForAttendance: target.counts_for_attendance,
    description: target.description ?? "",
  };

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">活動管理</p>
        <h1>編輯活動</h1>
        {target.status === "published" && <p>
          這場活動已經發布。<strong>改動時間或地點時，系統會通知已配對 LINE 的社員</strong>；
          只改標題或說明不會發送通知。
        </p>}
      </div>
      <Link className="button button-secondary" href={`/clubs/${clubId}/events?mode=management`}>← 回活動管理</Link>
    </header>

    <section className="card">
      <EventCreateForm
        clubId={clubId}
        eventTypeLabels={eventTypeLabels}
        tags={((tagsResult.data as { tags?: never[] } | null)?.tags ?? [])}
        members={((membersResult.data ?? []) as never[])}
        editing={{ eventId, version: target.version, values }}
      />
    </section>
  </div>;
}
