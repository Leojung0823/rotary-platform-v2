/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { cancelEventAction, publishEventAction } from "@/app/event-actions";
import { EventCoverUpload } from "@/components/events/event-cover-upload";
import { EventCreateForm } from "@/components/events/event-create-form";
import { eventTypeLabels, formatDateTime, responseLabels, statusBadge, statusLabels, type ClubEvent, type EventClub } from "@/lib/events/page-contract";

export type EventManagementAudienceTag = { tag_id: string; tag_name: string; member_count: number };
export type EventManagementAudienceMember = { membership_id: string; display_name: string };

export function EventManagementPanel({
  selectedClub,
  events,
  coverUrls,
  audienceTags,
  audienceMembers,
}: {
  selectedClub: EventClub;
  events: readonly ClubEvent[];
  coverUrls: ReadonlyMap<string, string>;
  audienceTags: readonly EventManagementAudienceTag[];
  audienceMembers: readonly EventManagementAudienceMember[];
}) {
  return <div className="page-stack" data-testid="event-management">
    <section className="card">
      <div className="section-heading">
        <div><p className="eyebrow">活動管理</p><h2>建立活動草稿</h2></div>
        <span>{selectedClub.club_name}</span>
      </div>
      <EventCreateForm
        clubId={selectedClub.club_id}
        eventTypeLabels={eventTypeLabels}
        tags={audienceTags}
        members={audienceMembers}
      />
    </section>

    <section>
      <div className="section-heading">
        <div><p className="eyebrow">目前社別</p><h2>{selectedClub.club_name}</h2></div>
        <span>{events.length} 場活動</span>
      </div>
      {events.length === 0 ? <div className="empty">
        <div className="empty-icon">日</div>
        <h2>目前沒有活動</h2>
        <p>可以先建立草稿，確認後再發布給社員。</p>
      </div> : <div className="form-stack">
        {events.map((event) => <article className="card" key={event.id}>
          {event.cover_image_path && coverUrls.get(event.cover_image_path) && <img
            className="event-cover"
            src={coverUrls.get(event.cover_image_path)}
            alt=""
            loading="lazy"
          />}
          <div className="section-heading">
            <div>
              <div className="status-pair">
                <span className={statusBadge(event.status)}>{statusLabels[event.status]}</span>
                <span className="badge badge-neutral">{eventTypeLabels[event.event_type] ?? "其他"}</span>
                {event.counts_for_attendance && <span className="badge badge-neutral">計入出席</span>}
              </div>
              <h2><a href={`/events/${encodeURIComponent(event.id)}?clubId=${encodeURIComponent(selectedClub.club_id)}&mode=member`}>{event.title}</a></h2>
            </div>
            <span>版本 {event.version}</span>
          </div>

          <div className="two-column">
            <div>
              <p><strong>時間：</strong>{formatDateTime(event.starts_at)}－{formatDateTime(event.ends_at)}</p>
              <p><strong>地點：</strong>{event.location || "尚未填寫"}</p>
              <p><strong>報名截止：</strong>{formatDateTime(event.registration_deadline)}</p>
              {event.description && <p>{event.description}</p>}
            </div>
            <div className="card">
              <span className="metric-label">目前參加</span>
              <strong className="metric-value metric-text">{event.attending_members} 人</strong>
              <p>{event.attending_spots} 個名額已使用{event.capacity === null ? " · 不限名額" : ` · 剩餘 ${event.remaining_spots ?? 0}`}</p>
              {event.my_response && <span className="badge badge-success">我的狀態：{responseLabels[event.my_response]}</span>}
            </div>
          </div>

          {event.status === "published" && event.counts_for_attendance && <div className="form-actions">
            <Link className="button" href={`/events/${encodeURIComponent(event.id)}/checkin?clubId=${encodeURIComponent(selectedClub.club_id)}&mode=management`}>管理簽到</Link>
          </div>}

          {event.status !== "cancelled" && <EventCoverUpload
            clubId={selectedClub.club_id}
            eventId={event.id}
            hasCover={Boolean(event.cover_image_path)}
          />}

          {event.status === "draft" && <form action={publishEventAction} className="form-actions">
            <input type="hidden" name="clubId" value={selectedClub.club_id} />
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="mode" value="management" />
            <button className="button" type="submit">發布活動</button>
          </form>}

          {event.status !== "cancelled" && event.status !== "completed" && <form action={cancelEventAction} className="inline-form">
            <input type="hidden" name="clubId" value={selectedClub.club_id} />
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="mode" value="management" />
            <label className="field"><span className="label">取消原因</span>
              <input className="input" name="reason" maxLength={500} required />
            </label>
            <span className="hint">取消後不可恢復，並會關閉 active 簽到 token、保留簽到歷史。</span>
            <button className="button button-danger" type="submit">取消活動</button>
          </form>}
        </article>)}
      </div>}
    </section>
  </div>;
}
