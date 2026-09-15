import Link from "next/link";
import { PortalIcon, type PortalIconName } from "./portal-icons";
import {
  featuredEventAction,
  registrationLabels,
  type PortalAnnouncement,
  type PortalClub,
  type PortalFeaturedEvent,
  type PortalMember,
  type PortalTask,
  type PortalUpcomingEvent,
} from "@/lib/member-portal/types";
import styles from "./member-portal.module.css";

// Two labels per destination, as the rest of this product already does: the
// sidebar has room for the full name, the bottom bar on a 320px phone gives
// each of six tabs about 53px. Shortening the label is what keeps the text at
// the 14px floor instead of shrinking it to fit.
const navigation: readonly {
  href: string;
  label: string;
  shortLabel: string;
  icon: PortalIconName;
}[] = [
  { href: "/dashboard", label: "首頁", shortLabel: "首頁", icon: "home" },
  { href: "/events", label: "活動", shortLabel: "活動", icon: "calendar" },
  { href: "/interact", label: "社內互動", shortLabel: "互動", icon: "chat" },
  { href: "/directory", label: "社員名錄", shortLabel: "社員", icon: "users" },
  { href: "/club-affairs", label: "社務", shortLabel: "社務", icon: "building" },
  { href: "/me", label: "我的", shortLabel: "我的", icon: "user" },
];

function Sidebar({ member, club, current }: { member: PortalMember; club: PortalClub; current: string }) {
  return <aside className={styles.sidebar}>
    <div className={styles.brand}>
      <span className={styles.brandMark} aria-hidden="true">R</span>
      <span className={styles.brandName}>扶輪管理平台</span>
    </div>

    <p className={styles.sidebarLabel}>所屬社團</p>
    <button type="button" className={styles.clubSelector}>
      <span>{club.name}</span>
      <PortalIcon name="chevronDown" size={18} />
    </button>

    <nav className={styles.nav} aria-label="主要導覽">
      {navigation.map((item) => <Link
        key={item.href}
        href={item.href}
        className={item.href === current ? `${styles.navItem} ${styles.navItemCurrent}` : styles.navItem}
        aria-current={item.href === current ? "page" : undefined}
      >
        <PortalIcon name={item.icon} size={21} />
        <span className={styles.navLabelFull}>{item.label}</span>
        <span className={styles.navLabelShort}>{item.shortLabel}</span>
      </Link>)}
    </nav>

    <button type="button" className={styles.accountCard}>
      <span className={styles.accountAvatar} aria-hidden="true">{member.initial}</span>
      <span className={styles.accountText}>
        <strong>{member.displayName}</strong>
        <small>帳號選單</small>
      </span>
      <PortalIcon name="chevronRight" size={18} />
    </button>

    <p className={styles.motto}>
      <span>Service Above Self</span>
      <span>超 我 服 務</span>
    </p>
  </aside>;
}

function Header({ member, today }: { member: PortalMember; today: { date: string; weekday: string } }) {
  return <header className={styles.header}>
    <div className={styles.headerGreeting}>
      <p className={styles.eyebrow}>社員首頁</p>
      <h1 className={styles.pageTitle}>{member.displayName}，您好</h1>
      <p className={styles.pageSubtitle}>今天與我有關的事情</p>
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
  const action = featuredEventAction(event.registration);
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

        <Link className={styles.cta} href={action.href}>
          <span>{action.label}</span>
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
      <Link className={styles.panelLink} href="/events">
        查看全部 <PortalIcon name="chevronRight" size={16} />
      </Link>
    </div>
    <div className={styles.panelRows}>{empty === null ? children : <p className={styles.panelEmpty}>{empty}</p>}</div>
  </section>;
}

export function MemberPortal({
  member, club, today, featuredEvent, upcomingEvents, tasks, announcements,
}: {
  member: PortalMember;
  club: PortalClub;
  today: { date: string; weekday: string };
  featuredEvent: PortalFeaturedEvent | null;
  upcomingEvents: readonly PortalUpcomingEvent[];
  tasks: readonly PortalTask[];
  announcements: readonly PortalAnnouncement[];
}) {
  return <div className={styles.portal}>
    <div className={styles.backdrop} aria-hidden="true" />
    <Sidebar member={member} club={club} current="/dashboard" />
    <main className={styles.main}>
      <Header member={member} today={today} />
      {/* Nothing to do today is the common case, and it says so in one line
          rather than spending the first screen on an absence. */}
      {featuredEvent === null
        ? <section className={styles.heroEmpty}>
          <span className={styles.heroSparkle} aria-hidden="true"><PortalIcon name="sparkle" size={18} /></span>
          <p>目前沒有需要處理的活動</p>
          <Link className={styles.heroEmptyLink} href="/events">查看活動 <PortalIcon name="chevronRight" size={16} /></Link>
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
    </main>
  </div>;
}
