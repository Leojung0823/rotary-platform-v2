import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, EmptyState, Notice } from "@/components/ui";
import { formatAnnouncementTime, parseManageableAnnouncements, type AnnouncementClub } from "@/lib/announcements/projections";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const statusLabel: Record<string, string> = { draft: "草稿", scheduled: "已排程", published: "已發布", expired: "已到期", cancelled: "已取消", archived: "已封存" };

export default async function AnnouncementManagementPage({ searchParams }: { searchParams: Promise<{ clubId?: string; status?: string; error?: string }> }) {
  await requireIdentity(); const query = await searchParams; const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_announcement_clubs");
  const clubs = clubsResult.error ? null : (clubsResult.data ?? []) as AnnouncementClub[];
  const manageableClubs = clubs?.filter((club) => club.can_manage) ?? [];
  if (clubs !== null && manageableClubs.length === 0) redirect("/access-denied?reason=announcement_manage_required");
  const selected = manageableClubs.find((club) => club.club_id === query.clubId) ?? manageableClubs[0] ?? null;
  const listResult = selected ? await supabase.rpc("list_manageable_announcements", {
    p_club_id: selected.club_id, p_status: query.status || null, p_cursor: null, p_limit: 100,
  }) : null;
  const announcements = listResult?.error ? null : listResult ? parseManageableAnnouncements(listResult.data) : [];
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">announcement.manage</p><h1>公告管理</h1><p>草稿、排程、版本、送達與 audit 都保留在同一社別邊界。</p></div><div className="form-actions"><Link className="button button-secondary" href="/announcements">社員公告</Link>{selected && <Link className="button" href={`/announcements/manage/new?clubId=${selected.club_id}`}>建立草稿</Link>}</div></header>
    {(clubs === null || announcements === null) && <Notice tone="error">您沒有管理權限，或目前無法讀取公告。</Notice>}{query.error && <Notice tone="error">操作未完成，請檢查權限、輸入或公告狀態。</Notice>}
    {manageableClubs.length > 0 && <form className="inline-form" method="get"><label className="field"><span className="label">扶輪社</span><select className="input" name="clubId" defaultValue={selected?.club_id}>{manageableClubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}</select></label><label className="field"><span className="label">狀態</span><select className="input" name="status" defaultValue={query.status ?? ""}><option value="">全部</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button" type="submit">篩選</button></form>}
    {announcements?.length === 0 && selected && <EmptyState title="尚無公告" body="建立第一份草稿後再選擇發布或排程。" />}
    {announcements && announcements.length > 0 && <div className="table-wrap"><table><thead><tr><th>公告</th><th>狀態</th><th>排程／發布</th><th>收件人</th><th></th></tr></thead><tbody>{announcements.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><br /><span className="hint">更新 {formatAnnouncementTime(item.updated_at)}</span></td><td><Badge tone={item.status === "published" ? "success" : item.status === "cancelled" ? "danger" : "warning"}>{statusLabel[item.status] ?? item.status}</Badge></td><td>{formatAnnouncementTime(item.publish_at)}</td><td>{item.recipient_count}</td><td><Link href={`/announcements/manage/${item.id}?clubId=${selected?.club_id}`}>管理 →</Link></td></tr>)}</tbody></table></div>}
  </div>;
}
