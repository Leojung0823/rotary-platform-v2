import Link from "next/link";
import { ClubSwitcher } from "@/components/club-switcher";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  formatDateTime,
  parseMemberClubs,
  parseMemberEvents,
  responseLabels,
  type MemberEventListItem,
} from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type Filter = "action" | "registered" | "upcoming" | "ended";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "action", label: "需要我回覆" },
  { key: "registered", label: "我已報名" },
  { key: "upcoming", label: "近期活動" },
  { key: "ended", label: "已結束" },
];

function matchesFilter(event: MemberEventListItem, filter: Filter) {
  if (filter === "action") return event.status === "published" && event.registration_open && (event.my_response === null || event.my_response === "pending");
  if (filter === "registered") return event.status === "published" && event.my_response === "attending" && !event.ended;
  if (filter === "ended") return event.ended;
  return !event.ended;
}

function EventRow({ event }: { event: MemberEventListItem }) {
  const status = event.status === "cancelled" ? "活動已取消"
    : event.checked_in ? `已簽到 ${new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.checked_in_at!))}`
      : event.my_response ? responseLabels[event.my_response] : "尚未報名";
  const action = event.checkin_available ? "我要簽到"
    : event.status === "cancelled" ? "查看說明"
      : event.my_response === "attending" ? "查看我的報名"
        : event.registration_open ? "立即報名" : "查看活動";
  return <article className="event-list-card">
    <div className="event-date-box"><time dateTime={event.starts_at}>{formatDateTime(event.starts_at)}</time></div>
    <div className="event-list-copy">
      <h2>{event.title}</h2>
      <p>{event.location || "地點將另行通知"}</p>
      <span className={event.status === "cancelled" ? "state-text state-danger" : "state-text"}>{status}</span>
    </div>
    <Link className={`button ${event.checkin_available ? "" : "button-secondary"}`} href={event.checkin_available ? `/events/${event.id}/checkin` : `/events/${event.id}`}>{action}</Link>
  </article>;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; filter?: string }>;
}) {
  await requireIdentity();
  const params = await searchParams;
  const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_member_clubs");
  const clubs = clubsResult.error ? null : parseMemberClubs(clubsResult.data);
  if (!clubs) return <div className="page-stack"><header><h1>活動</h1></header><Notice tone="error">活動暫時無法載入，請重新整理；若問題持續，請聯絡扶輪社秘書。</Notice></div>;
  if (clubs.length === 0) return <div className="page-stack"><header><h1>活動</h1></header><EmptyState title="目前沒有活動" body="加入扶輪社後，即可查看社內活動。" /></div>;

  const selectedClub = clubs.find((club) => club.club_id === params.clubId) ?? clubs[0];
  const filter = filters.some((item) => item.key === params.filter) ? params.filter as Filter : "action";
  const result = await supabase.rpc("list_member_events", { p_club_id: selectedClub.club_id });
  const events = result.error ? null : parseMemberEvents(result.data);
  const shown = events?.filter((event) => matchesFilter(event, filter)) ?? [];

  return <div className="page-stack">
    <header className="page-header"><div><h1>活動</h1><p>查看近期活動、完成報名與確認自己的出席狀態。</p></div></header>
    <ClubSwitcher clubs={clubs} selectedClubId={selectedClub.club_id} />
    <nav className="filter-tabs" aria-label="活動篩選">
      {filters.map((item) => <Link
        key={item.key}
        href={`/events?clubId=${encodeURIComponent(selectedClub.club_id)}&filter=${item.key}`}
        aria-current={filter === item.key ? "page" : undefined}
      >{item.label}</Link>)}
    </nav>
    {!events && <Notice tone="error">活動暫時無法載入，請重新整理；若問題持續，請聯絡扶輪社秘書。</Notice>}
    {events && shown.length === 0 && <EmptyState
      title={filter === "action" ? "目前沒有需要回覆的活動" : "這個分類目前沒有活動"}
      body={filter === "action" ? "可查看近期活動，或稍後再回來確認。" : "請切換其他分類查看。"}
    />}
    <div className="event-list">{shown.map((event) => <EventRow key={event.id} event={event} />)}</div>
  </div>;
}
