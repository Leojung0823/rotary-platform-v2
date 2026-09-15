import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Notice } from "@/components/ui";
import {
  MemberLineOaOnboarding,
  MemberLineOaOnboardingLoading,
} from "@/components/member-line-oa-onboarding";
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
import { signCoverImageUrls } from "@/lib/events/cover-image.server";
import { resolveMemberHomeProjection } from "@/lib/member-home.server";
import { APP_TIME_ZONE } from "@/lib/time";
import { ShellIcon } from "./shell-icons";
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
  timeZone: APP_TIME_ZONE,
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const memberHomeDateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: APP_TIME_ZONE,
  month: "long",
  day: "numeric",
});

// An announcement is filed by the day it went out; the minute never matters.
function formatDate(value: string) {
  return memberHomeDateFormatter.format(new Date(value));
}

function formatDateTime(value: string) {
  return memberHomeDateTimeFormatter.format(new Date(value));
}

function EventSummary({
  event,
  coverUrl,
  primary = false,
}: {
  event: MemberHomeEvent;
  coverUrl?: string;
  primary?: boolean;
}) {
  const action = memberHomePrimaryAction(event);
  const registered = event.registrationState === "registered";
  return <Card className={primary ? styles.primaryCard : styles.nextCard}>
    {/* The label sits above the poster, not under it. Under the image it read
        as a caption for the picture; above it, it says what the whole card is. */}
    <div className={styles.cardTop}>
      <p className="eyebrow">{primary ? "優先處理" : "接下來"}</p>
      <Link className={styles.cardTopLink} href="/events" prefetch={false}>查看全部 ›</Link>
    </div>
    {coverUrl && <Image
      className={styles.eventCover}
      src={coverUrl}
      alt=""
      width={960}
      height={360}
      sizes="(max-width: 720px) 100vw, 720px"
      unoptimized
    />}
    {/* Everything except the poster lives in one column, so the desktop grid
        has three children to place rather than six. The previous version
        addressed each child by grid-column, which meant a change to the card's
        markup silently rearranged the desktop layout -- and did. */}
    <div className={styles.cardBody}>
      <h2 className={styles.eventTitle}>{event.title}</h2>
      <Badge tone={registered ? "success" : "neutral"}>
        {registered && <ShellIcon name="check" />}
        {registrationLabels[event.registrationState]}
      </Badge>
      {/* Icon, label, value -- the same three-part row for each fact, so the
          eye finds the time in the same place on every card. */}
      <dl className={styles.eventDetails}>
        <div>
          <span className={styles.detailIcon} aria-hidden="true"><ShellIcon name="calendar" /></span>
          <div><dt>時間</dt><dd>{formatDateTime(event.startsAt)}</dd></div>
        </div>
        <div>
          <span className={styles.detailIcon} aria-hidden="true"><ShellIcon name="pin" /></span>
          <div><dt>地點</dt><dd>{event.location || "地點待確認"}</dd></div>
        </div>
        {primary && <div>
          <span className={styles.detailIcon} aria-hidden="true"><ShellIcon name="check" /></span>
          <div><dt>簽到</dt><dd>{checkinLabels[event.checkinState]}</dd></div>
        </div>}
      </dl>
      {primary && event.checkinState !== "checked_in" && <Link className="button" href={action.href} prefetch={false}>
        {action.label}
      </Link>}
    </div>
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

// A notification that asks the member to go and do something opens the place
// it is talking about. Where the sender named no destination, the message
// centre is still a better landing place than nothing at all.
function NotificationRow({
  notification,
  clubId,
}: {
  notification: MemberHomeNotification;
  clubId: string;
}) {
  const href = notification.actionPath
    ?? `/messages?clubId=${encodeURIComponent(clubId)}`;

  // The dot says read or unread, which is the one thing about an announcement
  // a member cannot work out by looking. A colour alone would not be allowed to
  // carry that, so the unread title is also bold and the state is spelled out
  // for a screen reader.
  return <Link
    className={`${styles.announcementRow} ${notification.unread ? styles.announcementUnread : ""}`}
    href={href}
    prefetch={false}
  >
    <span className={styles.announcementDot} aria-hidden="true" />
    <span className={styles.announcementText}>
      <small>
        {formatDate(notification.publishedAt)}
        {notification.unread && <span className="sr-only">（未讀）</span>}
      </small>
      <strong>{notification.title}</strong>
      <span>{notification.bodyPreview}</span>
    </span>
  </Link>;
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
  const showAnnouncements = messageCenterEnabled
    && (projection.notifications.unreadCount > 0 || projection.notifications.items.length > 0);

  // One signing round trip for both cards. The bucket is private, so the page
  // hands the browser a short-lived URL rather than a path it could not fetch.
  const coverUrls = await signCoverImageUrls([
    projection.primaryEvent?.coverImagePath,
    projection.nextEvent?.coverImagePath,
  ]);

  return <>
    {projection.primaryEvent ? <EventSummary
      event={projection.primaryEvent}
      coverUrl={coverUrls.get(projection.primaryEvent.coverImagePath ?? "")}
      primary
    /> : <Card className={styles.emptyCard}>
      {/* Nothing to do is the most common state on most days, so it says so in
          one line instead of spending the whole first screen on an absence. */}
      <div>
        <p className="eyebrow">今天</p>
        <h2>目前沒有需要處理的活動</h2>
      </div>
      <Link className="button button-secondary" href="/events" prefetch={false}>查看活動</Link>
    </Card>}

    {projection.nextEvent && <section aria-labelledby="member-home-next-event">
      <div className="section-heading">
        <div><p className="eyebrow">下一場</p><h2 id="member-home-next-event">接下來的活動</h2></div>
        <Link className="card-link" href="/events" prefetch={false}>查看全部活動 →</Link>
      </div>
      <EventSummary event={projection.nextEvent} />
    </section>}

    {(projection.recentEvents.length > 0 || showAnnouncements) && <div className={styles.bottomGrid}>
      {showAnnouncements && <Card className={styles.announcements} aria-labelledby="member-home-notifications">
        {/* The same header shape every card on this page uses: a label on the
            left and the way out on the right. Repeating one row is what makes
            a page of different things read as one product. */}
        <div className={styles.cardTop}>
          <p className="eyebrow" id="member-home-notifications">社團公告</p>
          <Link className={styles.cardTopLink} href={`/messages?clubId=${encodeURIComponent(activeClubId)}`} prefetch={false}>查看全部 ›</Link>
        </div>
        <div className={styles.announcementList}>
          {projection.notifications.items.length > 0
            ? projection.notifications.items.map((notification, index) => <NotificationRow
              key={`${notification.publishedAt}-${index}`}
              notification={notification}
              clubId={activeClubId}
            />)
            : <p className={styles.announcementEmpty}>目前沒有社團公告。</p>}
        </div>
      </Card>}

      {projection.recentEvents.length > 0 && <Card aria-labelledby="member-home-recent-events">
        <div className={styles.cardTop}>
          <p className="eyebrow" id="member-home-recent-events">近期社團回顧</p>
          <Link className={styles.cardTopLink} href="/events" prefetch={false}>查看全部 ›</Link>
        </div>
        <div className={styles.recentList}>
          {projection.recentEvents.map((event, index) => <RecentEventRow key={`${event.title}-${index}`} event={event} />)}
        </div>
      </Card>}
    </div>}
  </>;
}

export function MemberHome({
  identity,
  activeClub,
  blessingIouEnabled = false,
  duesFinanceEnabled = false,
  messageCenterEnabled = false,
  lineOaOnboardingEnabled = false,
}: {
  identity: Identity;
  activeClub: Pick<ClubContext, "clubId" | "clubCode" | "clubName">;
  blessingIouEnabled?: boolean;
  duesFinanceEnabled?: boolean;
  messageCenterEnabled?: boolean;
  lineOaOnboardingEnabled?: boolean;
}) {
  return <div className={`page-stack ${styles.memberHome}`}>
    <header className="page-header">
      <div>
        <p className="eyebrow">社員首頁 · {activeClub.clubCode}</p>
        <h1>{identity.display_name}，您好</h1>
        <h2 className={styles.todayHeading}>今天與我有關的事情</h2>
      </div>
    </header>
    <Suspense fallback={<MemberHomeContentLoading />}>
      <MemberHomeContent activeClubId={activeClub.clubId} messageCenterEnabled={messageCenterEnabled} />
    </Suspense>
    {lineOaOnboardingEnabled && <Suspense fallback={<MemberLineOaOnboardingLoading />}>
      <MemberLineOaOnboarding clubId={activeClub.clubId} />
    </Suspense>}
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
    {duesFinanceEnabled && <Link
      className={styles.financeShortcut}
      href={`/dues?clubId=${encodeURIComponent(activeClub.clubId)}&mode=member`}
      prefetch={false}
    >
      <span className={styles.financeIcon} aria-hidden="true">$</span>
      <span><strong>我的社費</strong><small>查看自己的應收、收款與代墊狀態</small></span>
      <b aria-hidden="true">→</b>
    </Link>}
  </div>;
}
