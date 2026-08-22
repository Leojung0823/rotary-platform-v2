/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { registerEventAction } from "@/app/event-actions";
import { ShellIcon } from "@/components/shell-icons";
import { Badge, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { signCoverImageUrls } from "@/lib/events/cover-image.server";
import { currentExperienceMode } from "@/lib/experience-mode.server";
import { createClient } from "@/lib/supabase/server";
import styles from "./event-detail.module.css";

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(value));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const time = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${time.format(new Date(startsAt))} – ${time.format(new Date(endsAt))}`;
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [identity, { eventId }, query] = await Promise.all([
    requireIdentity(),
    params,
    searchParams,
  ]);
  const mode = await currentExperienceMode(identity.id);
  const managementView = mode === null || mode === "management";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_club_event", {
    p_event_id: eventId,
    p_as_member: !managementView,
  });
  // An event that is not for this member and one that does not exist are the
  // same answer here, on purpose.
  if (error || !data) notFound();

  const payload = data as { club_id: string; event: ClubEvent; happening_now: boolean; is_past: boolean };
  const event = payload.event;
  const coverUrls = await signCoverImageUrls([event.cover_image_path]);
  const coverUrl = event.cover_image_path ? coverUrls.get(event.cover_image_path) : undefined;

  // Both come from the database, which is already the clock for
  // registration_open. Deciding them here would mean a viewer whose device
  // clock or timezone differs is offered check-in at the wrong moment.
  const isPast = payload.is_past;
  const happeningNow = payload.happening_now;

  return <div className="page-stack">
    <p><Link href="/events">← 回到活動列表</Link></p>

    {query.success === "registration_saved" && <Notice tone="success">報名狀態已更新。</Notice>}
    {query.error && <Notice tone="error">目前無法完成操作，請稍後再試。</Notice>}

    <article className={styles.detail}>
      {coverUrl && <img className={styles.cover} src={coverUrl} alt="" />}

      <header className={styles.header}>
        <div className="status-pair">
          <Badge tone={event.status === "published" ? "success" : event.status === "cancelled" ? "danger" : "neutral"}>
            {statusLabels[event.status]}
          </Badge>
          <Badge tone="neutral">{eventTypeLabels[event.event_type] ?? "其他"}</Badge>
          {event.counts_for_attendance && <Badge tone="neutral">計入出席</Badge>}
          {isPast && <Badge tone="neutral">已過去</Badge>}
        </div>
        <h1>{event.title}</h1>
        {event.description && <p className={styles.description}>{event.description}</p>}
      </header>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.factIcon}><ShellIcon name="calendar" /></span>
          <div><strong>日期</strong><span>{formatDate(event.starts_at)}</span></div>
        </div>
        <div className={styles.fact}>
          <span className={styles.factIcon}><ShellIcon name="chart" /></span>
          <div><strong>時間</strong><span>{formatTimeRange(event.starts_at, event.ends_at)}</span></div>
        </div>
        <div className={`${styles.fact} ${styles.factWide}`}>
          <span className={styles.factIcon}><ShellIcon name="home" /></span>
          <div><strong>地點</strong><span>{event.location || "未設定"}</span></div>
        </div>
        <div className={styles.fact}>
          <span className={styles.factIcon}><ShellIcon name="users" /></span>
          <div>
            <strong>目前參加</strong>
            <span>{event.attending_members} 人{event.capacity === null
              ? "（不限名額）"
              : `，剩餘 ${event.remaining_spots ?? 0} 個名額`}</span>
          </div>
        </div>
      </div>

      {happeningNow && <div className={styles.live}>
        <div>
          <strong>活動進行中</strong>
          <span>您現在可以簽到。</span>
        </div>
        <Link className="button" href="/events/checkin">前往簽到</Link>
      </div>}

      {event.status === "published" && event.registration_open && <form action={registerEventAction} className="form-stack">
        <input type="hidden" name="clubId" value={payload.club_id} />
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

      {event.status === "published" && !event.registration_open && !isPast && <Notice>
        報名已截止，或活動已經開始。
      </Notice>}

      {event.can_manage && <p className="hint">
        管理這場活動請回到<Link href="/events?mode=management">活動管理</Link>。
      </p>}
    </article>
  </div>;
}
