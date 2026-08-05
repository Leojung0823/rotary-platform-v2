import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelEventAction, createEventAction, publishEventAction } from "@/app/event-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type ManagedEvent = {
  id: string; event_type: string; title: string; location: string; starts_at: string; ends_at: string;
  registration_deadline: string; status: "draft" | "published" | "cancelled" | "completed";
  counts_for_attendance: boolean; attending_members: number;
};

function parseEvents(value: unknown): ManagedEvent[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const events = (value as Record<string, unknown>).events;
  return Array.isArray(events) ? events as ManagedEvent[] : null;
}

export default async function ManagedEventsPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireIdentity();
  const [{ clubId }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  const clubsResult = await supabase.rpc("list_my_event_clubs");
  const club = Array.isArray(clubsResult.data) ? (clubsResult.data as Array<{ club_id: string; club_name: string; can_manage: boolean }>).find((item) => item.club_id === clubId) : null;
  if (!club?.can_manage) notFound();
  const eventsResult = await supabase.rpc("list_club_events", { p_club_id: clubId });
  const events = eventsResult.error ? null : parseEvents(eventsResult.data);

  return <div className="page-stack">
    <header className="page-header"><div><h1>活動管理</h1><p>{club.club_name}</p></div></header>
    {query.success && <Notice tone="success">活動資料已更新。</Notice>}
    {query.error && <Notice tone="error">操作未完成，請確認資料與權限後再試一次。</Notice>}
    <section className="card">
      <div className="section-heading"><h2>建立活動</h2></div>
      <form action={createEventAction} className="form-stack">
        <input type="hidden" name="clubId" value={clubId} />
        <input type="hidden" name="returnPath" value={`/clubs/${clubId}/events`} />
        <div className="form-grid">
          <label className="field"><span className="label">活動類型</span><select className="input" name="eventType" defaultValue="regular_meeting"><option value="regular_meeting">例會</option><option value="board_meeting">理監事會</option><option value="service">服務活動</option><option value="joint_meeting">聯合例會</option><option value="fireside">爐邊會</option><option value="other">其他</option></select></label>
          <label className="field"><span className="label">活動名稱</span><input className="input" name="title" maxLength={160} required /></label>
          <label className="field"><span className="label">開始時間</span><input className="input" type="datetime-local" name="startsAt" required /></label>
          <label className="field"><span className="label">結束時間</span><input className="input" type="datetime-local" name="endsAt" required /></label>
          <label className="field"><span className="label">報名截止</span><input className="input" type="datetime-local" name="registrationDeadline" required /></label>
          <label className="field"><span className="label">名額（選填）</span><input className="input" type="number" name="capacity" min={1} max={10000} /></label>
          <label className="field"><span className="label">地點</span><input className="input" name="location" maxLength={300} /></label>
          <label className="checkbox-row"><input type="checkbox" name="countsForAttendance" defaultChecked /><span><strong>計入出席</strong></span></label>
        </div>
        <label className="field"><span className="label">活動說明</span><textarea className="input" name="description" maxLength={5000} rows={4} /></label>
        <button className="button" type="submit">建立活動草稿</button>
      </form>
    </section>
    {!events && <Notice tone="error">活動暫時無法載入，請重新整理。</Notice>}
    <section><div className="section-heading"><h2>活動清單</h2></div><div className="management-card-list">
      {events?.map((event) => <article className="card" key={event.id}>
        <div className="section-heading"><div><h2>{event.title}</h2><p>{formatDateTime(event.starts_at, true)}｜{event.location || "尚未填寫地點"}</p></div><span className="badge badge-neutral">{event.status === "draft" ? "草稿" : event.status === "published" ? "已發布" : event.status === "cancelled" ? "已取消" : "已結束"}</span></div>
        <p>目前報名：{event.attending_members} 位社員</p>
        <div className="form-actions">
          {event.status === "draft" && <form action={publishEventAction}><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnPath" value={`/clubs/${clubId}/events`} /><button className="button" type="submit">發布活動</button></form>}
          {event.status === "published" && event.counts_for_attendance && <Link className="button" href={`/clubs/${clubId}/attendance/${event.id}`}>管理報名與簽到</Link>}
          {event.status === "published" && <details className="danger-details"><summary>取消活動</summary><form action={cancelEventAction} className="form-stack"><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnPath" value={`/clubs/${clubId}/events`} /><label className="field"><span className="label">取消原因</span><input className="input" name="reason" maxLength={500} required /></label><ConfirmSubmitButton className="button button-danger" type="submit" confirmMessage={`確定要取消「${event.title}」嗎？所有社員都會看到活動已取消。`}>確認取消活動</ConfirmSubmitButton></form></details>}
        </div>
      </article>)}
    </div></section>
  </div>;
}
