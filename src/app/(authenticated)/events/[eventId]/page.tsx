import Link from "next/link";
import { notFound } from "next/navigation";
import { registerEventAction } from "@/app/event-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime, formatTime, responseLabels } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type EventDetail = {
  id: string;
  club_id: string;
  club_name: string;
  event_type: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  capacity: number | null;
  status: "published" | "cancelled" | "completed";
  cancellation_reason: string | null;
  my_response: "pending" | "attending" | "declined" | null;
  my_guest_count: number;
  my_note: string;
  registration_open: boolean;
  checked_in: boolean;
  attendance_id: string | null;
  checked_in_at: string | null;
  checkin_method: "qr" | "gps" | "manual" | null;
  checkin: null | { window_open: boolean; gps_enabled: boolean; qr_enabled: boolean; qr_session_open: boolean };
};

function isEventDetail(value: unknown): value is EventDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === "string" && typeof event.club_id === "string" && typeof event.title === "string"
    && typeof event.starts_at === "string" && typeof event.ends_at === "string"
    && typeof event.registration_deadline === "string" && typeof event.registration_open === "boolean";
}

const errorMessages: Record<string, string> = {
  invalid_input: "請確認報名資料後再試一次。",
  capacity_full: "活動名額已滿，這次報名尚未完成。請聯絡活動承辦人協助。",
  registration_closed: "活動已開始或報名已截止，目前無法修改報名。",
  forbidden: "您目前無法報名這場活動，請聯絡扶輪社秘書協助。",
  unexpected: "報名暫時無法完成，請稍後再試；若問題持續，請聯絡扶輪社秘書。",
};

function calendarUrl(event: EventDetail) {
  const compact = (value: string) => new Date(value).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compact(event.starts_at)}/${compact(event.ends_at)}`,
    location: event.location,
    details: event.description,
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [identity, route, query, supabase] = await Promise.all([requireIdentity(), params, searchParams, createClient()]);
  const result = await supabase.rpc("get_member_event_detail", { p_event_id: route.eventId });
  if (result.error || !isEventDetail(result.data)) notFound();
  const event = result.data;
  const checkinAvailable = event.status === "published" && event.checkin?.window_open
    && (event.checkin.gps_enabled || (event.checkin.qr_enabled && event.checkin.qr_session_open));

  return <div className="page-stack narrow">
    <Link className="back-link" href={`/events?clubId=${encodeURIComponent(event.club_id)}`}>← 返回活動</Link>
    {query.success === "registration_saved" && <section className="success-result" role="status" aria-live="polite">
      <span className="success-check" aria-hidden="true">✓</span>
      <h1>{event.my_response === "attending" ? "報名完成" : event.my_response === "declined" ? "已取消報名" : "報名內容已更新"}</h1>
      <p>{formatDateTime(event.starts_at)}</p>
      {event.my_response === "attending" && <p><strong>{identity.display_name}{event.my_guest_count > 0 ? `＋${event.my_guest_count} 位同行者` : ""}</strong></p>}
      <div className="form-actions"><a className="button" href={calendarUrl(event)} target="_blank" rel="noreferrer">加入行事曆</a><Link className="button button-secondary" href={`/events/${event.id}`}>返回活動</Link></div>
    </section>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}

    <article className="event-detail-card">
      {event.status === "cancelled" && <Notice tone="error">活動已取消{event.cancellation_reason ? `：${event.cancellation_reason}` : "。"}</Notice>}
      <header><p className="selected-club-name">{event.club_name}</p><h1>{event.title}</h1></header>
      <dl className="event-facts">
        <div><dt>日期與時間</dt><dd>{formatDateTime(event.starts_at, true)}－{formatTime(event.ends_at)}</dd></div>
        <div><dt>地點</dt><dd>{event.location || "地點將另行通知"}</dd></div>
        <div><dt>報名截止</dt><dd>{formatDateTime(event.registration_deadline, true)}</dd></div>
      </dl>
      {event.description && <div className="event-description"><h2>活動說明</h2><p>{event.description}</p></div>}
    </article>

    {event.checked_in ? <section className="checkin-complete-card">
      <span aria-hidden="true">✓</span><div><h2>您已完成簽到</h2><p>{event.checked_in_at ? `${formatTime(event.checked_in_at)} 完成簽到` : ""}</p></div>
    </section> : checkinAvailable ? <Link className="button button-full" href={`/events/${event.id}/checkin`}>我要簽到</Link> : null}

    <section className="card" aria-labelledby="registration-heading">
      <div className="section-heading"><h2 id="registration-heading">我的報名</h2></div>
      <p><strong>目前狀態：{event.my_response ? responseLabels[event.my_response] : "尚未報名"}</strong></p>
      {event.my_response === "attending" && <p>本人{event.my_guest_count > 0 ? `＋${event.my_guest_count} 位同行者` : ""}</p>}
      {event.registration_open ? <form action={registerEventAction} className="form-stack">
        <input type="hidden" name="clubId" value={event.club_id} />
        <input type="hidden" name="eventId" value={event.id} />
        <label className="field"><span className="label">是否參加</span>
          <select className="input" name="response" defaultValue={event.my_response ?? "attending"}>
            <option value="attending">參加</option>
            <option value="pending">稍後決定</option>
            <option value="declined">不參加</option>
          </select>
        </label>
        <label className="field"><span className="label">同行者人數</span>
          <input className="input" type="number" name="guestCount" min={0} max={20} inputMode="numeric" defaultValue={event.my_guest_count} />
          <span className="hint">沒有同行者請填 0。</span>
        </label>
        <label className="field"><span className="label">備註（選填）</span><textarea className="input" name="note" maxLength={500} rows={3} defaultValue={event.my_note} /></label>
        <button className="button button-full" type="submit">{event.my_response ? "更新報名" : "確認報名"}</button>
      </form> : <Notice>報名已截止，目前無法修改。</Notice>}

      {event.registration_open && event.my_response === "attending" && <form action={registerEventAction} className="danger-zone compact-danger-zone">
        <input type="hidden" name="clubId" value={event.club_id} />
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="response" value="declined" />
        <input type="hidden" name="guestCount" value="0" />
        <input type="hidden" name="note" value="" />
        <ConfirmSubmitButton className="button button-danger" type="submit" confirmMessage={`確定要取消「${event.title}」的報名嗎？`}>取消報名</ConfirmSubmitButton>
      </form>}
    </section>
  </div>;
}
