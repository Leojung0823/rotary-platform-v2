import Link from "next/link";
import { ClubSwitcher } from "@/components/club-switcher";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime, parseMemberClubs, responseLabels } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type AttentionItem = {
  kind: "checkin" | "registration" | "announcement" | "profile";
  event_id?: string;
  announcement_id?: string;
  title: string;
  starts_at?: string;
  location?: string;
  registration_deadline?: string;
  gps_enabled?: boolean;
  qr_enabled?: boolean;
};

type HomeEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  registration_deadline: string;
  my_response: "pending" | "attending" | "declined" | null;
  my_guest_count: number;
  registration_open: boolean;
};

type HomeData = {
  club: { id: string; name: string; code: string };
  member: { membership_id: string; display_name: string; avatar_url: string | null; role_key: string; missing_contact: boolean };
  needs_attention: AttentionItem[];
  next_event: HomeEvent | null;
  my_registrations: Array<{ id: string; title: string; starts_at: string; location: string; guest_count: number }>;
  announcements: Array<{ id: string; title: string; published_at: string; pinned: boolean; requires_acknowledgement: boolean; acknowledged: boolean }>;
};

function isHomeData(value: unknown): value is HomeData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const home = value as Record<string, unknown>;
  return Boolean(home.club && home.member)
    && Array.isArray(home.needs_attention)
    && Array.isArray(home.my_registrations)
    && Array.isArray(home.announcements);
}

function AttentionCard({ item, clubId }: { item: AttentionItem; clubId: string }) {
  if (item.kind === "profile") return <article className="task-card">
    <div><h3>{item.title}</h3><p>補上手機與 Email，讓社友可以在需要時聯絡您。</p></div>
    <Link className="button" href="/me/profile">修改我的資料</Link>
  </article>;
  if (item.kind === "announcement") return <article className="task-card">
    <div><span className="task-label">重要公告</span><h3>{item.title}</h3></div>
    <Link className="button" href={`/announcements?clubId=${encodeURIComponent(clubId)}#announcement-${item.announcement_id}`}>查看公告</Link>
  </article>;
  if (item.kind === "checkin") return <article className="task-card task-card-highlight">
    <div><span className="task-label">現在可以簽到</span><h3>{item.title}</h3>
      {item.starts_at && <p>{formatDateTime(item.starts_at)}{item.location ? `｜${item.location}` : ""}</p>}
    </div>
    <Link className="button" href={`/events/${item.event_id}/checkin`}>我要簽到</Link>
  </article>;
  return <article className="task-card">
    <div><span className="task-label">尚未回覆</span><h3>{item.title}</h3>
      {item.registration_deadline && <p>請在 {formatDateTime(item.registration_deadline)} 前完成報名。</p>}
    </div>
    <Link className="button" href={`/events/${item.event_id}`}>立即報名</Link>
  </article>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string }>;
}) {
  const [identity, params, supabase] = await Promise.all([requireIdentity(), searchParams, createClient()]);
  const clubsResult = await supabase.rpc("list_my_member_clubs");
  const clubs = clubsResult.error ? null : parseMemberClubs(clubsResult.data);

  if (!clubs) return <div className="page-stack"><Notice tone="error">首頁暫時無法載入，請重新整理；若問題持續，請聯絡扶輪社秘書。</Notice></div>;
  if (clubs.length === 0) return <div className="page-stack">
    <header className="page-header"><div><h1>{identity.display_name}，您好</h1></div></header>
    <EmptyState title="尚未加入扶輪社" body="接受扶輪社邀請後，即可在首頁查看活動與公告。" />
  </div>;

  const selectedClub = clubs.find((club) => club.club_id === params.clubId) ?? clubs[0];
  const homeResult = await supabase.rpc("get_member_home", { p_club_id: selectedClub.club_id });
  const home = homeResult.error || !isHomeData(homeResult.data) ? null : homeResult.data;

  return <div className="page-stack member-home">
    <header className="member-home-header">
      <ClubSwitcher clubs={clubs} selectedClubId={selectedClub.club_id} />
      <h1>{identity.display_name}，您好</h1>
    </header>

    {!home && <Notice tone="error">目前無法載入首頁內容，請重新整理；若問題持續，請聯絡扶輪社秘書。</Notice>}
    {home && <>
      {home.needs_attention.length > 0 && <section aria-labelledby="attention-heading">
        <div className="section-heading"><h2 id="attention-heading">現在需要處理</h2></div>
        <div className="task-list">{home.needs_attention.slice(0, 4).map((item, index) => <AttentionCard key={`${item.kind}-${item.event_id ?? item.announcement_id ?? index}`} item={item} clubId={selectedClub.club_id} />)}</div>
      </section>}

      {home.next_event && <section className="home-section" aria-labelledby="next-event-heading">
        <div className="section-heading"><h2 id="next-event-heading">下一場活動</h2></div>
        <article className="event-feature-card">
          <time dateTime={home.next_event.starts_at}>{formatDateTime(home.next_event.starts_at)}</time>
          <h3>{home.next_event.title}</h3>
          <p>{home.next_event.location || "地點將另行通知"}</p>
          <p>報名截止：{formatDateTime(home.next_event.registration_deadline)}</p>
          <p><strong>您的狀態：{home.next_event.my_response ? responseLabels[home.next_event.my_response] : "尚未報名"}</strong></p>
          <div className="form-actions">
            <Link className="button" href={`/events/${home.next_event.id}`}>{home.next_event.my_response === "attending" ? "查看我的報名" : home.next_event.registration_open ? "立即報名" : "查看活動"}</Link>
            <Link className="button button-secondary" href={`/events?clubId=${encodeURIComponent(selectedClub.club_id)}`}>查看所有活動</Link>
          </div>
        </article>
      </section>}

      {home.my_registrations.length > 0 && <section className="home-section" aria-labelledby="my-registration-heading">
        <div className="section-heading"><h2 id="my-registration-heading">我的報名</h2></div>
        <div className="compact-list">{home.my_registrations.map((event) => <Link key={event.id} href={`/events/${event.id}`}>
          <span><strong>{event.title}</strong><small>{formatDateTime(event.starts_at)}{event.location ? `｜${event.location}` : ""}</small></span>
          <span>已報名{event.guest_count > 0 ? `｜本人＋${event.guest_count} 位` : ""}</span>
        </Link>)}</div>
      </section>}

      {home.announcements.length > 0 && <section className="home-section" aria-labelledby="announcements-heading">
        <div className="section-heading"><h2 id="announcements-heading">最新公告</h2></div>
        <div className="compact-list">{home.announcements.map((announcement) => <Link key={announcement.id} href={`/announcements?clubId=${encodeURIComponent(selectedClub.club_id)}#announcement-${announcement.id}`}>
          <span><strong>{announcement.title}</strong><small>{formatDateTime(announcement.published_at)}</small></span>
          {announcement.requires_acknowledgement && !announcement.acknowledged && <span className="status-text">需要確認</span>}
        </Link>)}</div>
        <Link className="text-action" href={`/announcements?clubId=${encodeURIComponent(selectedClub.club_id)}`}>查看全部公告</Link>
      </section>}

      <section className="home-section" aria-labelledby="quick-heading">
        <div className="section-heading"><h2 id="quick-heading">常用功能</h2></div>
        <div className="quick-grid">
          <Link href={`/events?clubId=${encodeURIComponent(selectedClub.club_id)}`}>活動</Link>
          <Link href={`/directory?clubId=${encodeURIComponent(selectedClub.club_id)}`}>社員名冊</Link>
          <Link href="/me/profile">我的資料</Link>
          <Link href={`/board?clubId=${encodeURIComponent(selectedClub.club_id)}`}>留言板</Link>
        </div>
      </section>
    </>}
  </div>;
}
