import Link from "next/link";
import { PortalIcon, type PortalIconName } from "./portal-icons";
import {
  registrationLabels,
  type PortalAnnouncement,
  type PortalEntry,

  type PortalFeaturedEvent,
  type PortalMember,
  type PortalTask,
  type PortalUpcomingEvent,
} from "@/lib/member-portal/types";
import styles from "./member-portal.module.css";

function Header({ member, today }: { member: PortalMember; today: { date: string; weekday: string } }) {
  return <header className={styles.header}>
    <div className={styles.headerGreeting}>
      <p className={styles.eyebrow}>社員首頁</p>
      <h1 className={styles.pageTitle}>{member.displayName}，您好</h1>
      {/* A heading, styled small. It names what this page is for, and reading
          by heading is how a screen reader user moves through it -- the same
          mistake was made with the announcements card and fixed there. */}
      <h2 className={styles.pageSubtitle}>今天與我有關的事情</h2>
    </div>

    <div className={styles.headerSide}>
      <div className={styles.headerTools}>
        <div className={styles.search}>
          <PortalIcon name="search" size={19} />
          <input type="search" placeholder="搜尋活動、社員或公告..." aria-label="搜尋活動、社員或公告" />
        </div>
        <button type="button" className={styles.bell} aria-label="通知">
          <PortalIcon name="bell" size={21} />
          <span className={styles.bellDot} aria-hidden="true" />
        </button>
        <span className={styles.headerAvatar} aria-hidden="true">{member.initial}</span>
      </div>
      <p className={styles.today}><strong>{today.date}</strong><span>{today.weekday}</span></p>
      <p className={styles.tagline}>每一份參與，都讓世界更美好</p>
      <p className={styles.motto2}>
        <span>TOGETHER</span><span>WE CREATE</span><span>A BRIGHTER TOMORROW</span>
      </p>
    </div>
  </header>;
}

// Event titles here are written as "main｜subtitle". The separator is where the
// title divides, so that is where the line divides -- the reference breaks in
// the same place, and it holds for any title written this way rather than for
// one particular string. The text content is unchanged, so the heading still
// reads as one name.
function renderEventTitle(title: string) {
  const separator = title.indexOf("｜");
  if (separator < 0) return title;
  return <>
    {title.slice(0, separator)}
    <span className={styles.heroTitleTail}>{title.slice(separator)}</span>
  </>;
}

function HeroCard({ event }: { event: PortalFeaturedEvent }) {
  return <section className={styles.hero} aria-labelledby="portal-hero-title">
    <div className={styles.heroHeading}>
      <span className={styles.heroSparkle} aria-hidden="true"><PortalIcon name="sparkle" size={18} /></span>
      <h2 className={styles.sectionTitle}>精選活動</h2>
    </div>

    <div className={event.coverUrl === null ? `${styles.heroBody} ${styles.heroBodyNoCover}` : styles.heroBody}>
      {/* An event with no poster gets no empty frame: the card drops the
          column and gives the width to the details. */}
      {event.coverUrl !== null && <div className={styles.heroCover}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.coverUrl} alt="" />
      </div>}

      <div className={styles.heroInfo}>
        <div className={styles.heroInfoTop}>
          <span className={styles.metaLabel}>優先處理</span>
          <span className={styles.statusPill}>{registrationLabels[event.registration]}</span>
        </div>

        <h3 className={styles.heroTitle} id="portal-hero-title">{renderEventTitle(event.title)}</h3>
        {event.summary !== "" && <p className={styles.heroSummary}>{event.summary}</p>}

        <dl className={styles.heroFacts}>
          <div>
            <dt aria-hidden="true"><PortalIcon name="calendar" size={19} /></dt>
            <dd>{event.startsAt}</dd>
          </div>
          <div>
            <dt aria-hidden="true"><PortalIcon name="pin" size={19} /></dt>
            <dd>
              <span>{event.venue}</span>
              {event.venueAddress !== "" && <small>{event.venueAddress}</small>}
            </dd>
          </div>
          <div>
            <dt aria-hidden="true"><PortalIcon name="clipboard" size={19} /></dt>
            <dd>{event.checkinNote}</dd>
          </div>
        </dl>

        <Link className={styles.cta} href={event.action.href} prefetch={false}>
          <span>{event.action.label}</span>
          <PortalIcon name="arrowRight" size={19} />
        </Link>
      </div>
    </div>
  </section>;
}

function DashboardCard({
  icon, title, tone, empty, children,
}: {
  icon: PortalIconName;
  title: string;
  tone: "blue" | "green" | "amber";
  empty: string | null;
  children: React.ReactNode;
}) {
  return <section className={styles.panel}>
    <div className={styles.panelHead}>
      <span className={`${styles.panelIcon} ${styles[`panelIcon_${tone}`]}`} aria-hidden="true">
        <PortalIcon name={icon} size={20} />
      </span>
      <h2 className={styles.cardTitle}>{title}</h2>
      <Link className={styles.panelLink} href="/events" prefetch={false}>
        查看全部 <PortalIcon name="chevronRight" size={16} />
      </Link>
    </div>
    <div className={styles.panelRows}>{empty === null ? children : <p className={styles.panelEmpty}>{empty}</p>}</div>
  </section>;
}

export type MemberPortalContentProps = {
  member: PortalMember;
  today: { date: string; weekday: string };
  featuredEvent: PortalFeaturedEvent | null;
  upcomingEvents: readonly PortalUpcomingEvent[];
  tasks: readonly PortalTask[];
  announcements: readonly PortalAnnouncement[];
  /** Ways into features the home page is the only route to. */
  entries: readonly PortalEntry[];
  /** Anything the home must still carry, such as the LINE pairing prompt. */
  children?: React.ReactNode;
};

/**
 * The page without its own navigation, for use inside the application shell
 * that already provides one. The full portal below adds the rail around it.
 */
/** The greeting, which needs no data and so need not wait for any. */
export function MemberPortalHeader({
  member, today,
}: {
  member: PortalMember;
  today: { date: string; weekday: string };
}) {
  return <Header member={member} today={today} />;
}

/** What the page can only draw once the projection has arrived. */
export function MemberPortalBody({
  featuredEvent, upcomingEvents, tasks, announcements, entries, children,
}: Omit<MemberPortalContentProps, "member" | "today">) {
  return <>
      {/* Nothing to do today is the common case, and it says so in one line
          rather than spending the first screen on an absence. */}
      {featuredEvent === null
        ? <section className={styles.heroEmpty}>
          <span className={styles.heroSparkle} aria-hidden="true"><PortalIcon name="sparkle" size={18} /></span>
          <p>目前沒有需要處理的活動</p>
          <Link className={styles.heroEmptyLink} href="/events" prefetch={false}>查看活動 <PortalIcon name="chevronRight" size={16} /></Link>
        </section>
        : <HeroCard event={featuredEvent} />}

      <div className={styles.dashboard}>
        <DashboardCard icon="calendar" title="近期活動" tone="blue" empty={upcomingEvents.length === 0 ? "近期沒有活動" : null}>
          {upcomingEvents.map((event) => <div className={styles.eventRow} key={event.title}>
            <span className={styles.dateCard}>
              <small>{event.month}</small>
              <strong>{event.day}</strong>
            </span>
            <span className={styles.rowText}>
              <strong>{event.title}</strong>
              <small>{event.when}</small>
            </span>
            <span className={`${styles.rowPill} ${event.state === "open" ? styles.rowPillOpen : ""}`}>
              {registrationLabels[event.state]}
            </span>
          </div>)}
        </DashboardCard>

        <DashboardCard icon="checkSquare" title="待辦提醒" tone="green" empty={tasks.length === 0 ? "目前沒有待辦事項" : null}>
          {tasks.map((task) => <Link className={styles.taskRow} key={`${task.title}-${task.detail}`} href={task.href} prefetch={false}>
            <span className={`${styles.taskIcon} ${styles[`taskIcon_${task.tone}`]}`} aria-hidden="true">
              <PortalIcon name={task.icon === "bell" ? "bell" : task.icon === "document" ? "document" : "users"} size={19} />
            </span>
            <span className={styles.rowText}>
              <strong>{task.title}</strong>
              <small>{task.detail}</small>
            </span>
            {task.status
              ? <span className={`${styles.rowPill} ${task.tone === "danger" ? styles.rowPillDanger : ""}`}>{task.status}</span>
              : <span className={styles.rowChevron} aria-hidden="true"><PortalIcon name="chevronRight" size={17} /></span>}
          </Link>)}
        </DashboardCard>

        <DashboardCard icon="megaphone" title="社團公告" tone="amber" empty={announcements.length === 0 ? "目前沒有社團公告" : null}>
          {announcements.map((item) => <Link
            className={item.unread ? `${styles.noticeRow} ${styles.noticeRowUnread}` : styles.noticeRow}
            key={`${item.date}-${item.title}`}
            href={item.href}
            prefetch={false}
          >
            {/* The dot is read state, not a category colour: a green, blue or
                amber category tells a member nothing they can act on, while
                unread is the one thing they cannot work out by looking. It is
                said twice -- the dot and the weight -- because colour may not
                be the only signal. */}
            <span className={styles.noticeDot} aria-hidden="true" />
            <span className={styles.rowText}>
              <small>{item.date}{item.unread && <span className={styles.srOnly}>（未讀）</span>}</small>
              <strong>{item.title}</strong>
              <span>{item.summary}</span>
            </span>
          </Link>)}
        </DashboardCard>
      </div>

      {children}

      {/* The reference design shows no such row. It is here because removing
          it would remove the only way a member reaches the message centre,
          their dues or the blessing board from this page. */}
      {entries.length > 0 && <section className={styles.entries} aria-labelledby="portal-entries">
        <h2 className={styles.entriesHeading} id="portal-entries">常用入口</h2>
        <div className={styles.entryGrid}>
          {entries.map((entry) => <Link className={styles.entry} key={entry.href} href={entry.href} prefetch={false}>
            <span className={styles.entryIcon} aria-hidden="true"><PortalIcon name={entry.icon} size={20} /></span>
            <span className={styles.rowText}>
              <strong>{entry.title}</strong>
              <small>{entry.detail}</small>
            </span>
            <PortalIcon name="chevronRight" size={17} />
          </Link>)}
        </div>
      </section>}
  </>;
}

/** The page's own frame, inside the shell that carries the navigation. */
export function MemberPortalShell({ children }: { children: React.ReactNode }) {
  return <div className={styles.contentOnly}>
    <div className={styles.backdrop} aria-hidden="true" />
    <main className={styles.main}>{children}</main>
  </div>;
}
