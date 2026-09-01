/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  cancelEventAction,
  publishEventAction,
  registerEventAction,
} from "@/app/event-actions";
import { EventCreateForm } from "@/components/events/event-create-form";
import { requireIdentity } from "@/lib/auth";
import { currentExperienceMode } from "@/lib/experience-mode.server";
import { EventCoverUpload } from "@/components/events/event-cover-upload";
import { signCoverImageUrls } from "@/lib/events/cover-image.server";
import { createClient } from "@/lib/supabase/server";

type EventClub = {
  club_id: string;
  club_code: string;
  club_name: string;
  can_manage: boolean;
  can_register: boolean;
};

type ClubEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  capacity: number | null;
  counts_for_attendance: boolean;
  status: "draft" | "published" | "cancelled" | "completed";
  version: number;
  attending_members: number;
  attending_spots: number;
  remaining_spots: number | null;
  my_response: "pending" | "attending" | "declined" | null;
  my_guest_count: number;
  my_note: string;
  can_manage: boolean;
  cover_image_path: string | null;
  registration_open: boolean;
};

const eventTypeLabels: Record<string, string> = {
  regular_meeting: "例會",
  board_meeting: "理監事會",
  service: "服務活動",
  joint_meeting: "聯合例會",
  fireside: "爐邊會",
  other: "其他",
};

const statusLabels: Record<ClubEvent["status"], string> = {
  draft: "草稿",
  published: "已發布",
  cancelled: "已取消",
  completed: "已結束",
};

const responseLabels: Record<Exclude<ClubEvent["my_response"], null>, string> = {
  pending: "待確認",
  attending: "參加",
  declined: "不參加",
};

const successMessages: Record<string, string> = {
  event_created: "活動草稿已建立，確認內容後即可發布。",
  event_published: "活動已發布，社員現在可以報名。",
  event_cancelled: "活動已取消並留下稽核紀錄。",
  registration_saved: "報名狀態已更新。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整或格式不正確。",
  capacity_full: "活動名額已滿，這次報名沒有寫入。",
  registration_closed: "活動已開始或報名已截止。",
  cannot_publish: "活動目前不能發布，請確認開始與截止時間。",
  forbidden: "目前帳號沒有執行此動作的權限。",
  unexpected: "目前無法完成操作，請稍後再試。",
};

function isEventClub(value: unknown): value is EventClub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const club = value as Record<string, unknown>;
  return typeof club.club_id === "string"
    && typeof club.club_code === "string"
    && typeof club.club_name === "string"
    && typeof club.can_manage === "boolean"
    && typeof club.can_register === "boolean";
}

function isClubEvent(value: unknown): value is ClubEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === "string"
    && typeof event.event_type === "string"
    && typeof event.title === "string"
    && typeof event.description === "string"
    && typeof event.location === "string"
    && typeof event.starts_at === "string"
    && typeof event.ends_at === "string"
    && typeof event.registration_deadline === "string"
    && (typeof event.capacity === "number" || event.capacity === null)
    && (typeof event.cover_image_path === "string" || event.cover_image_path === null || event.cover_image_path === undefined)
    && typeof event.counts_for_attendance === "boolean"
    && (event.status === "draft" || event.status === "published" || event.status === "cancelled" || event.status === "completed")
    && typeof event.version === "number"
    && typeof event.attending_members === "number"
    && typeof event.attending_spots === "number"
    && (typeof event.remaining_spots === "number" || event.remaining_spots === null)
    && (event.my_response === null || event.my_response === "pending" || event.my_response === "attending" || event.my_response === "declined")
    && typeof event.my_guest_count === "number"
    && typeof event.my_note === "string"
    && typeof event.can_manage === "boolean"
    && typeof event.registration_open === "boolean";
}

function parseEvents(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const events = (value as Record<string, unknown>).events;
  if (!Array.isArray(events) || !events.every(isClubEvent)) return null;
  return events;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function statusBadge(status: ClubEvent["status"]) {
  if (status === "published") return "badge badge-success";
  if (status === "cancelled") return "badge badge-danger";
  if (status === "draft") return "badge badge-warning";
  return "badge badge-neutral";
}

function EventHeader({ clubId, canManage = false }: { clubId?: string | null; canManage?: boolean }) {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社務互動</p>
      <h1>活動與報名</h1>
      <p>社員查看同社活動並回覆參加狀態；活動資料、名額、簽到與權限都由資料庫依社別驗證。</p>
    </div>
    <div className="form-actions">
      {clubId && canManage && <a className="button button-secondary" href={`/clubs/${encodeURIComponent(clubId)}/events?mode=management`}>活動管理</a>}
      <Link className="button" href="/events/checkin">社員簽到</Link>
    </div>
  </header>;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; success?: string; error?: string }>;
}) {
  const [identity, params] = await Promise.all([requireIdentity(), searchParams]);
  // An officer is also an ordinary member. In member mode they get the member
  // view of their own club -- no drafts, no management controls, and their own
  // check-in -- and the database is asked the member's question so the two
  // never drift apart. A null mode means role shells are off, where there is
  // no member/management distinction to honour.
  const mode = await currentExperienceMode(identity.id);
  const managementView = mode === null || mode === "management";
  const supabase = await createClient();
  // One call: the database picks the club the same way this page used to --
  // the one named in the query string, otherwise the first -- so the events
  // come back with the club list instead of a round trip behind it.
  const pageResult = await supabase.rpc("list_my_event_page", {
    p_club_id: params.clubId ?? null,
    p_as_member: !managementView,
  });
  const projection = (pageResult.data ?? {}) as { clubs?: unknown; events?: unknown };

  const clubRows = Array.isArray(projection.clubs) ? projection.clubs : null;
  if (pageResult.error || !clubRows || !clubRows.every(isEventClub)) {
    return <div className="page-stack">
      <EventHeader />
      <div className="notice notice-error" role="alert">目前無法確認活動社別與權限，請稍後重新整理。</div>
    </div>;
  }

  const selectedClub = clubRows.find((club) => club.club_id === params.clubId) ?? clubRows[0] ?? null;
  if (mode === "management") {
    if (!selectedClub?.can_manage) redirect("/access-denied");
    redirect(`/clubs/${encodeURIComponent(selectedClub.club_id)}/events?mode=management`);
  }
  const canManageHere = managementView && Boolean(selectedClub?.can_manage);

  let events: ClubEvent[] = [];
  let eventsUnavailable = false;
  if (selectedClub) {
    const parsed = parseEvents({ events: projection.events });
    if (!parsed) eventsUnavailable = true;
    else events = parsed;
  }

  // Only a manager can address an audience, and only in management mode, so
  // the tag and member lists are fetched only then -- a member's events page
  // gains no query for a control it will never see.
  let audienceTags: { tag_id: string; tag_name: string; member_count: number }[] = [];
  let audienceMembers: { membership_id: string; display_name: string }[] = [];
  if (canManageHere && selectedClub) {
    const [tagsResult, membersResult] = await Promise.all([
      supabase.rpc("list_club_member_tags", { p_club_id: selectedClub.club_id }),
      supabase.rpc("list_club_members", { p_club_id: selectedClub.club_id, p_query: null, p_status: "active" }),
    ]);
    audienceTags = ((tagsResult.data as { tags?: typeof audienceTags } | null)?.tags ?? []);
    audienceMembers = ((membersResult.data ?? []) as { membership_id: string; display_name: string }[])
      .map((member) => ({ membership_id: member.membership_id, display_name: member.display_name }));
  }

  const coverUrls = await signCoverImageUrls(events.map((event) => event.cover_image_path));

  return <div className="page-stack">
    <EventHeader clubId={selectedClub?.club_id} canManage={Boolean(selectedClub?.can_manage)} />

    {params.success && successMessages[params.success] && <div className="notice notice-success" role="status">
      {successMessages[params.success]}
    </div>}
    {params.error && <div className="notice notice-error" role="alert">
      {errorMessages[params.error] ?? errorMessages.unexpected}
    </div>}

    {clubRows.length > 1 && <section>
      <div className="section-heading"><h2>選擇扶輪社</h2></div>
      <div className="club-grid">
        {clubRows.map((club) => <Link
          key={club.club_id}
          href={`/events?clubId=${encodeURIComponent(club.club_id)}`}
          className="club-card"
          aria-current={selectedClub?.club_id === club.club_id ? "page" : undefined}
        >
          <div><span className="club-code">{club.club_code}</span><h3>{club.club_name}</h3></div>
          <span className="card-link">{selectedClub?.club_id === club.club_id ? "目前顯示" : "查看活動 →"}</span>
        </Link>)}
      </div>
    </section>}

    {!selectedClub && <div className="empty">
      <div className="empty-icon">日</div>
      <h2>目前沒有可使用的活動社別</h2>
      <p>只有啟用中的扶輪社、有效社員或具活動管理權限的帳號會顯示。</p>
    </div>}

    {canManageHere && selectedClub && <section className="card">
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
    </section>}

    {selectedClub && <section>
      <div className="section-heading">
        <div><p className="eyebrow">目前社別</p><h2>{selectedClub.club_name}</h2></div>
        <span>{events.length} 場活動</span>
      </div>

      {eventsUnavailable && <div className="notice notice-error" role="alert">目前無法載入活動資料，系統不會把權限或資料庫錯誤當成空資料。</div>}
      {!eventsUnavailable && events.length === 0 && <div className="empty">
        <div className="empty-icon">日</div>
        <h2>目前沒有活動</h2>
        <p>{canManageHere ? "可以先建立草稿，確認後再發布給社員。" : "活動發布後會顯示在這裡。"}</p>
      </div>}

      <div className="form-stack">
        {events.map((event) => <article className="card" key={event.id}>
          {/* Plain <img> rather than next/image: the URL is signed and
              expires, so the optimizer cannot cache it, and optimizing on a
              0.1 CPU instance would cost more than it saves. The browser
              already resized the picture before uploading it. */}
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
              <h2><Link href={`/events/${encodeURIComponent(event.id)}`}>{event.title}</Link></h2>
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

          {event.status === "published" && event.registration_open && selectedClub.can_register && <form action={registerEventAction} className="form-stack">
            <input type="hidden" name="clubId" value={selectedClub.club_id} />
            <input type="hidden" name="eventId" value={event.id} />
            <div className="form-grid">
              <label className="field"><span className="label">我的回覆</span>
                <select className="input" name="response" defaultValue={event.my_response ?? "pending"}>
                  <option value="pending">待確認</option>
                  <option value="attending">參加</option>
                  <option value="declined">不參加</option>
                </select>
              </label>
              <label className="field"><span className="label">攜伴人數</span>
                <input className="input" type="number" name="guestCount" min={0} max={20} defaultValue={event.my_guest_count} inputMode="numeric" />
              </label>
            </div>
            <label className="field"><span className="label">備註</span>
              <input className="input" name="note" maxLength={500} defaultValue={event.my_note} />
            </label>
            <div className="form-actions"><button className="button" type="submit">儲存報名狀態</button></div>
          </form>}

          {event.status === "published" && !event.registration_open && <div className="notice notice-info">活動已開始或報名已截止，目前不能修改報名。</div>}
          {event.status === "published" && event.registration_open && !selectedClub.can_register && <div className="notice notice-info">此帳號可管理活動，但不是該社有效社員，因此不能占用社員報名名額。</div>}

          {event.status === "published" && event.counts_for_attendance && <div className="form-actions">
            {selectedClub.can_register && <Link className="button button-secondary" href="/events/checkin">本人簽到</Link>}
            {canManageHere && <Link
              className="button"
              href={`/events/${encodeURIComponent(event.id)}/checkin?clubId=${encodeURIComponent(selectedClub.club_id)}`}
            >管理簽到</Link>}
          </div>}

          {canManageHere && event.status !== "cancelled" && <EventCoverUpload
            clubId={selectedClub.club_id}
            eventId={event.id}
            hasCover={Boolean(event.cover_image_path)}
          />}

          {canManageHere && event.status === "draft" && <form action={publishEventAction} className="form-actions">
            <input type="hidden" name="clubId" value={selectedClub.club_id} />
            <input type="hidden" name="eventId" value={event.id} />
            <button className="button" type="submit">發布活動</button>
          </form>}

          {canManageHere && event.status !== "cancelled" && event.status !== "completed" && <form action={cancelEventAction} className="inline-form">
            <input type="hidden" name="clubId" value={selectedClub.club_id} />
            <input type="hidden" name="eventId" value={event.id} />
            <label className="field"><span className="label">取消原因</span>
              <input className="input" name="reason" maxLength={500} required />
            </label>
            <span className="hint">取消後不可恢復，並會關閉 active 簽到 token、保留簽到歷史。</span>
            <button className="button button-danger" type="submit">取消活動</button>
          </form>}
        </article>)}
      </div>
    </section>}
  </div>;
}
