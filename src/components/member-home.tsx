import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Notice } from "@/components/ui";
import type { Identity } from "@/lib/auth";
import type { ClubContext } from "@/lib/experience-context";
import {
  memberHomePrimaryAction,
  type MemberHomeCheckinState,
  type MemberHomeEvent,
  type MemberHomeRecentEvent,
  type MemberHomeNotification,
  type MemberHomeRegistrationState,
} from "@/lib/member-home";
import { resolveMemberHomeProjection } from "@/lib/member-home.server";
import styles from "./member-home.module.css";

const registrationLabels: Record<MemberHomeRegistrationState, string> = {
  not_registered: "尚未報名",
  pending: "待確認",
  registered: "已報名",
  declined: "已婉拒",
  registration_closed: "報名已截止",
};

const checkinLabels: Record<MemberHomeCheckinState, string> = {
  not_available: "本活動不需簽到",
  not_open: "簽到尚未開放",
  available: "現在可簽到",
  checked_in: "已完成簽到",
  closed: "簽到已結束",
};

const memberHomeDateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: string) {
  return memberHomeDateTimeFormatter.format(new Date(value));
}

function EventSummary({ event, primary = false }: { event: MemberHomeEvent; primary?: boolean }) {
  const action = memberHomePrimaryAction(event);
  return <Card className={primary ? styles.primaryCard : styles.nextCard}>
    <div className={styles.eventHeading}>
      <div>
        <p className="eyebrow">{primary ? "優先處理" : "接下來"}</p>
        <h2>{event.title}</h2>
      </div>
      <Badge tone={event.registrationState === "registered" ? "success" : "neutral"}>
        {registrationLabels[event.registrationState]}
      </Badge>
    </div>
    <dl className={styles.eventDetails}>
      <div><dt>時間</dt><dd>{formatDateTime(event.startsAt)}</dd></div>
      <div><dt>地點</dt><dd>{event.location || "地點待確認"}</dd></div>
      {primary && <div><dt>簽到</dt><dd>{checkinLabels[event.checkinState]}</dd></div>}
    </dl>
    {primary && event.checkinState !== "checked_in" && <Link className="button" href={action.href} prefetch={false}>
      {action.label}
    </Link>}
  </Card>;
}

function RecentEventRow({ event }: { event: MemberHomeRecentEvent }) {
  return <div className={styles.recentItem}>
    <div>
      <strong>{event.title}</strong>
      <small>{formatDateTime(event.startsAt)}{event.location ? ` · ${event.location}` : ""}</small>
    </div>
    <Badge tone={event.attended ? "success" : "neutral"}>{event.attended ? "已出席" : "未出席"}</Badge>
  </div>;
}

function NotificationRow({ notification }: { notification: MemberHomeNotification }) {
  return <article className={styles.notificationItem}>
    <div>
      <span className={styles.notificationTitle}>
        <strong>{notification.title}</strong>
        {notification.unread && <Badge tone="warning">未讀</Badge>}
      </span>
      <p>{notification.bodyPreview}</p>
      <small>{formatDateTime(notification.publishedAt)}</small>
    </div>
  </article>;
}

function MemberHomeContentLoading() {
  return <section aria-busy="true" aria-live="polite">
    <span className="sr-only">正在載入今天的活動</span>
    <div className="skeleton-card">
      <span className="skeleton skeleton-eyebrow" />
      <span className="skeleton skeleton-card-title" />
      <span className="skeleton skeleton-copy skeleton-copy-wide" />
      <span className="skeleton skeleton-copy" />
    </div>
  </section>;
}

async function MemberHomeContent({
  activeClubId,
  messageCenterEnabled,
}: {
  activeClubId: string;
  messageCenterEnabled: boolean;
}) {
  const resolution = await resolveMemberHomeProjection(activeClubId);
  if (!resolution.ok) {
    return <Notice tone="error">目前無法載入社員首頁資料，請稍後重新整理。</Notice>;
  }

  const { projection } = resolution;
  return <>
    {messageCenterEnabled && (projection.notifications.unreadCount > 0 || projection.notifications.items.length > 0) && <section aria-labelledby="member-home-notifications">
      <div className="section-heading">
        <div className={styles.notificationHeading}>
          <p className="eyebrow">社內通知</p>
          <h2 id="member-home-notifications">最新通知</h2>
          {projection.notifications.unreadCount > 0 && <Badge tone="warning">{projection.notifications.unreadCount} 則未讀</Badge>}
        </div>
        <Link className="card-link" href={`/messages?clubId=${encodeURIComponent(activeClubId)}`} prefetch={false}>查看全部通知 →</Link>
      </div>
      <div className={styles.notificationList}>
        {projection.notifications.items.length > 0
          ? projection.notifications.items.map((notification, index) => <NotificationRow
            key={`${notification.publishedAt}-${index}`}
            notification={notification}
          />)
          : <p>目前沒有可顯示的通知內容。</p>}
      </div>
    </section>}

    {projection.primaryEvent ? <EventSummary event={projection.primaryEvent} primary /> : <Card className={styles.emptyCard}>
      <p className="eyebrow">今天</p>
      <h2>目前沒有需要處理的活動</h2>
      <p>新的已發布活動會在這裡顯示。</p>
      <Link className="button button-secondary" href="/events" prefetch={false}>查看活動</Link>
    </Card>}

    {projection.nextEvent && <section aria-labelledby="member-home-next-event">
      <div className="section-heading">
        <div><p className="eyebrow">下一場</p><h2 id="member-home-next-event">接下來的活動</h2></div>
        <Link className="card-link" href="/events" prefetch={false}>查看全部活動 →</Link>
      </div>
      <EventSummary event={projection.nextEvent} />
    </section>}

    {projection.recentEvents.length > 0 && <section aria-labelledby="member-home-recent-events">
      <div className="section-heading">
        <div><p className="eyebrow">回顧</p><h2 id="member-home-recent-events">近期社團回顧</h2></div>
        <Link className="card-link" href="/events" prefetch={false}>查看全部活動 →</Link>
      </div>
      <div className={styles.recentList}>
        {projection.recentEvents.map((event, index) => <RecentEventRow key={`${event.title}-${index}`} event={event} />)}
      </div>
    </section>}
  </>;
}

export function MemberHome({
  identity,
  activeClub,
  blessingIouEnabled = false,
  messageCenterEnabled = false,
}: {
  identity: Identity;
  activeClub: Pick<ClubContext, "clubId" | "clubCode" | "clubName">;
  blessingIouEnabled?: boolean;
  messageCenterEnabled?: boolean;
}) {
  return <div className={`page-stack ${styles.memberHome}`}>
    <header className="page-header">
      <div>
        <p className="eyebrow">社員首頁 · {activeClub.clubCode}</p>
        <h1>{identity.display_name}，您好</h1>
        <h2 className={styles.todayHeading}>今天與我有關的事情</h2>
      </div>
      <Badge tone="success">{activeClub.clubName}</Badge>
    </header>
    <section className={styles.secondarySection} aria-labelledby="member-home-secondary-actions">
      <div className="section-heading">
        <div><p className="eyebrow">常用入口</p><h2 id="member-home-secondary-actions">社內連結</h2></div>
      </div>
      <div className={styles.secondaryActions}>
        {messageCenterEnabled && <Link
          className={styles.secondaryAction}
          href="/messages?mode=member"
          prefetch={false}
        >
          <span><strong>訊息中心</strong><small>查看幹部發送給您的社內訊息</small></span>
          <b aria-hidden="true">→</b>
        </Link>}
        <Link className={styles.secondaryAction} href="/interact?mode=member" prefetch={false}>
          <span><strong>社內互動</strong><small>前往留言板、生日祝福與祝福 IOU</small></span>
          <b aria-hidden="true">→</b>
        </Link>
      </div>
    </section>
    {blessingIouEnabled && <Link
      className={styles.blessingShortcut}
      href={`/blessings?clubId=${encodeURIComponent(activeClub.clubId)}&mode=member`}
      prefetch={false}
    >
      <span className={styles.blessingIcon} aria-hidden="true">♡</span>
      <span><strong>祝福 IOU</strong><small>分享祝福，也可以留下希望捐贈的金額</small></span>
      <b aria-hidden="true">→</b>
    </Link>}
    <Suspense fallback={<MemberHomeContentLoading />}>
      <MemberHomeContent activeClubId={activeClub.clubId} messageCenterEnabled={messageCenterEnabled} />
    </Suspense>
  </div>;
}
