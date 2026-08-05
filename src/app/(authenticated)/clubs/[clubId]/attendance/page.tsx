import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

export default async function AttendanceManagementPage({ params }: { params: Promise<{ clubId: string }> }) {
  await requireIdentity();
  const { clubId } = await params;
  const supabase = await createClient();
  const clubs = await supabase.rpc("list_my_event_clubs");
  const club = Array.isArray(clubs.data) ? (clubs.data as Array<{ club_id: string; club_name: string; can_manage: boolean }>).find((item) => item.club_id === clubId) : null;
  if (!club?.can_manage) notFound();
  const result = await supabase.rpc("list_club_events", { p_club_id: clubId });
  const events = !result.error && result.data && typeof result.data === "object" && !Array.isArray(result.data) && Array.isArray((result.data as Record<string, unknown>).events)
    ? ((result.data as Record<string, unknown>).events as Array<{ id: string; title: string; starts_at: string; location: string; status: string; counts_for_attendance: boolean; attending_members: number }>)
      .filter((event) => event.counts_for_attendance && event.status === "published") : null;
  return <div className="page-stack">
    <header className="page-header"><div><h1>報名與簽到</h1><p>{club.club_name}</p></div></header>
    {!events && <Notice tone="error">目前無法載入活動，請重新整理。</Notice>}
    {events?.length === 0 && <EmptyState title="目前沒有可管理的活動" body="已發布且計入出席的活動會顯示在這裡。" />}
    <div className="management-card-list">{events?.map((event) => <article className="card" key={event.id}><h2>{event.title}</h2><p>{formatDateTime(event.starts_at, true)}｜{event.location || "尚未填寫地點"}</p><p>目前報名：{event.attending_members} 位社員</p><Link className="button" href={`/clubs/${clubId}/attendance/${event.id}`}>進入現場簽到</Link></article>)}</div>
  </div>;
}
