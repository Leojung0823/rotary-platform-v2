import { acknowledgeAnnouncementAction } from "@/app/announcement-actions";
import { ClubSwitcher } from "@/components/club-switcher";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime, parseMemberClubs } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type Announcement = { id: string; title: string; body: string; status: string; pinned: boolean; requires_acknowledgement: boolean; published_at: string; expires_at: string | null; acknowledged_at: string | null };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ clubId?: string; success?: string; error?: string }> }) {
  await requireIdentity();
  const query = await searchParams;
  const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_member_clubs");
  const clubs = clubsResult.error ? null : parseMemberClubs(clubsResult.data);
  if (!clubs) return <div className="page-stack"><h1>公告</h1><Notice tone="error">公告暫時無法載入，請重新整理。</Notice></div>;
  if (clubs.length === 0) return <div className="page-stack"><h1>公告</h1><EmptyState title="目前沒有公告" body="加入扶輪社後即可查看社內公告。" /></div>;
  const selectedClub = clubs.find((club) => club.club_id === query.clubId) ?? clubs[0];
  const result = await supabase.rpc("list_club_announcements", { p_club_id: selectedClub.club_id });
  const announcements = !result.error && result.data && typeof result.data === "object" && !Array.isArray(result.data) && Array.isArray((result.data as Record<string, unknown>).announcements)
    ? (result.data as { announcements: Announcement[] }).announcements.filter((item) => item.status === "published") : null;
  return <div className="page-stack narrow"><header><h1>公告</h1><p>查看扶輪社最新通知與需要確認的重要事項。</p></header><ClubSwitcher clubs={clubs} selectedClubId={selectedClub.club_id} />
    {query.success === "acknowledged" && <Notice tone="success">您已確認這則公告。</Notice>}{query.error && <Notice tone="error">操作暫時無法完成，請稍後再試。</Notice>}
    {!announcements && <Notice tone="error">公告暫時無法載入，請重新整理。</Notice>}
    {announcements?.length === 0 && <EmptyState title="目前沒有公告" body="新公告發布後會顯示在這裡。" />}
    <div className="announcement-list">{announcements?.map((announcement) => <article className="card" id={`announcement-${announcement.id}`} key={announcement.id}><div className="section-heading"><div>{announcement.pinned && <span className="state-text">重要公告</span>}<h2>{announcement.title}</h2></div><time dateTime={announcement.published_at}>{formatDateTime(announcement.published_at, true)}</time></div><p className="announcement-body">{announcement.body}</p>{announcement.requires_acknowledgement && (announcement.acknowledged_at ? <p className="state-text">✓ 您已確認</p> : <form action={acknowledgeAnnouncementAction}><input type="hidden" name="clubId" value={selectedClub.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><button className="button" type="submit">我已閱讀並確認</button></form>)}</article>)}</div>
  </div>;
}
