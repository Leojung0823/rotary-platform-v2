import Link from "next/link";
import { Badge, Card, EmptyState, Notice } from "@/components/ui";
import { formatAnnouncementTime, parseAnnouncementList, type AnnouncementClub } from "@/lib/announcements/projections";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ clubId?: string; error?: string }> }) {
  await requireIdentity();
  const query = await searchParams;
  const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_announcement_clubs");
  const clubs = clubsResult.error ? null : (clubsResult.data ?? []) as AnnouncementClub[];
  const selected = clubs?.find((club) => club.club_id === query.clubId) ?? clubs?.[0] ?? null;
  const listResult = selected ? await supabase.rpc("list_my_announcements", {
    p_club_id: selected.club_id, p_cursor: null, p_limit: 50,
  }) : null;
  const announcements = listResult?.error ? null : listResult ? parseAnnouncementList(listResult.data) : [];
  return <div className="page-stack">
    <header className="page-header"><div><p className="eyebrow">V0.9 社內溝通</p><h1>公告</h1><p>只顯示您目前具資格且符合受眾的已發布公告。</p></div>
      <div className="form-actions"><Link className="button button-secondary" href="/notifications">通知中心</Link>{selected?.can_manage && <Link className="button" href={`/announcements/manage?clubId=${selected.club_id}`}>管理公告</Link>}</div></header>
    {(clubs === null || announcements === null) && <Notice tone="error">目前無法讀取公告，請稍後再試。</Notice>}
    {query.error && <Notice tone="error">無法開啟該公告或您沒有存取權。</Notice>}
    {clubs && clubs.length > 1 && <form className="inline-form" method="get"><label className="field"><span className="label">切換扶輪社</span><select className="input" name="clubId" defaultValue={selected?.club_id}>{clubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}</select></label><button className="button" type="submit">切換</button></form>}
    {clubs?.length === 0 && <EmptyState title="尚無可讀公告的扶輪社" body="有效社籍啟用後，公告會出現在這裡。" />}
    {announcements?.length === 0 && selected && <EmptyState title="目前沒有公告" body="尚無符合受眾且仍在有效期間的公告。" />}
    {announcements && announcements.length > 0 && <div className="club-grid">{announcements.map((item) => <Card key={item.id}>
      <div className="status-pair">{item.pinned_until && new Date(item.pinned_until) > new Date() && <Badge tone="warning">置頂</Badge>}{!item.read_at && <Badge tone="success">未讀</Badge>}</div>
      <h2>{item.title}</h2><p>{item.excerpt}</p><p className="hint">發布：{formatAnnouncementTime(item.published_at)}{item.expire_at && <> · 到期：{formatAnnouncementTime(item.expire_at)}</>}</p>
      <Link className="card-link" href={`/announcements/${item.id}?clubId=${item.club_id}`}>查看公告 →</Link>
    </Card>)}</div>}
  </div>;
}
