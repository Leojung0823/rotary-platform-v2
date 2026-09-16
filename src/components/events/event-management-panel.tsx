/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { cancelEventAction, publishEventAction } from "@/app/event-actions";
import { EventCoverUpload } from "@/components/events/event-cover-upload";
import { EventRegistrationRoster } from "@/components/events/event-registration-roster";
import type { RegistrationRosterEntry } from "@/lib/events/registration-roster";
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
  rosters,
}: {
  selectedClub: EventClub;
  events: readonly ClubEvent[];
  coverUrls: ReadonlyMap<string, string>;
  audienceTags: readonly EventManagementAudienceTag[];
  audienceMembers: readonly EventManagementAudienceMember[];
  /** Per published event: who was asked and what they said. null means the
      read failed, which the card reports rather than drawing as "nobody". */
  rosters: ReadonlyMap<string, readonly RegistrationRosterEntry[] | null>;
}) {
  const live = events.filter((event) => event.status !== "cancelled");
  const cancelled = events.filter((event) => event.status === "cancelled");

  // One card, rendered for the live list and for the archive alike.
  function eventCard(event: ClubEvent) {
    return <article className="card" id={`event-${event.id}`} key={event.id}>
          {/* Folded by default. An officer scanning this list wants to see
              which event is which; a full-width poster on every card turns a
              dozen events into a page of scrolling. */}
          {event.cover_image_path && coverUrls.get(event.cover_image_path) && <details className="cover-fold">
            <summary>活動主視覺</summary>
            <img
              className="event-cover"
              src={coverUrls.get(event.cover_image_path)}
              alt=""
              loading="lazy"
            />
          </details>}
          <div className="section-heading">
            <div>
              <div className="status-pair">
                <span className={statusBadge(event.status)}>{statusLabels[event.status]}</span>
                <span className="badge badge-neutral">{eventTypeLabels[event.event_type] ?? "其他"}</span>
                {event.counts_for_attendance && <span className="badge badge-neutral">計入出席</span>}
                {event.my_response && <span className="badge badge-success">我的狀態：{responseLabels[event.my_response]}</span>}
              </div>
              <h2><a href={`/events/${encodeURIComponent(event.id)}?clubId=${encodeURIComponent(selectedClub.club_id)}&mode=member`}>{event.title}</a></h2>
            </div>
            <span>版本 {event.version}</span>
          </div>

          {/* One wrapping line of labelled facts. These were three paragraphs
              and a boxed metric in a side column: a card that said very little
              was 480px tall, and a dozen of them made the list unreadable. */}
          <dl className="event-facts">
            <div><dt>時間</dt><dd>{formatDateTime(event.starts_at)}－{formatDateTime(event.ends_at)}</dd></div>
            <div><dt>地點</dt><dd>{event.location || "尚未填寫"}</dd></div>
            <div><dt>報名截止</dt><dd>{event.registration_deadline === null
              ? "不設截止，活動結束前都可報名"
              : formatDateTime(event.registration_deadline)}</dd></div>
            <div><dt>目前參加</dt><dd>{event.attending_members} 人 · {event.attending_spots} 個名額已使用{event.capacity === null ? " · 不限名額" : ` · 剩餘 ${event.remaining_spots ?? 0}`}</dd></div>
          </dl>
          {event.description && <p className="event-description">{event.description}</p>}

          {event.status === "published" && <EventRegistrationRoster
            clubId={selectedClub.club_id}
            eventId={event.id}
            entries={rosters.get(event.id) ?? []}
          />}

          {/* Every action on one row. Each of these used to be its own
              block-level strip -- 管理簽到, 上傳圖片 and its explanation,
              編輯活動, 發布活動 -- four rows of chrome for four buttons. */}
          <div className="event-actions">
            {/* Editing is offered for exactly the states the database will
                accept, so the link never lands on a refusal. */}
            {(event.status === "draft" || event.status === "published") && <Link
              className="button button-secondary"
              href={`/clubs/${selectedClub.club_id}/events/${event.id}/edit`}
            >編輯活動</Link>}

            {event.status !== "cancelled" && <EventCoverUpload
              clubId={selectedClub.club_id}
              eventId={event.id}
              hasCover={Boolean(event.cover_image_path)}
            />}

            {event.status === "published" && event.counts_for_attendance && <Link
              className="button"
              href={`/events/${encodeURIComponent(event.id)}/checkin?clubId=${encodeURIComponent(selectedClub.club_id)}&mode=management`}
            >管理簽到</Link>}

            {event.status === "draft" && <form action={publishEventAction}>
              <input type="hidden" name="clubId" value={selectedClub.club_id} />
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="mode" value="management" />
              <button className="button" type="submit">發布活動</button>
            </form>}
          </div>

          {/* Folded. A destructive action with a required free-text reason sat
              permanently open at the foot of every live event, which is the
              opposite of how prominent it should be. */}
          {event.status !== "cancelled" && event.status !== "completed" && <details className="event-danger">
            <summary>取消活動</summary>
            <form action={cancelEventAction} className="inline-form">
              <input type="hidden" name="clubId" value={selectedClub.club_id} />
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="mode" value="management" />
              <label className="field"><span className="label">取消原因</span>
                <input className="input" name="reason" maxLength={500} required />
              </label>
              <span className="hint">取消後不可恢復，並會關閉 active 簽到 token、保留簽到歷史。</span>
              <button className="button button-danger" type="submit">取消活動</button>
            </form>
          </details>}
    </article>;
  }

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
        <span>{live.length} 場活動</span>
      </div>
      {events.length === 0 ? <div className="empty">
        <div className="empty-icon">日</div>
        <h2>目前沒有活動</h2>
        <p>可以先建立草稿，確認後再發布給社員。</p>
      </div> : <div className="form-stack">
        {live.map(eventCard)}
        {/* A cancelled event is still the officer's record of what was called
            off, so it is filed rather than hidden -- but it is not what anyone
            opened this page to read. */}
        {cancelled.length > 0 && <details className="archive-fold">
          <summary>已取消的活動（{cancelled.length}）</summary>
          <div className="form-stack">{cancelled.map(eventCard)}</div>
        </details>}
      </div>}
    </section>
  </div>;
}
