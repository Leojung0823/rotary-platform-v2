import Link from "next/link";
import { redirect } from "next/navigation";
import {
  archiveAnnouncementAction,
  cancelAnnouncementAction,
  publishAnnouncementAction,
  retryAnnouncementDeliveriesAction,
  scheduleAnnouncementAction,
  updateAnnouncementAction,
} from "@/app/announcement-actions";
import { Badge, Card, Notice } from "@/components/ui";
import {
  announcementTimeInput,
  formatAnnouncementTime,
  parseDeliverySummary,
  parseManageableAnnouncement,
} from "@/lib/announcements/projections";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Member = { membership_id: string; display_name: string };
const statusLabels: Record<string, string> = { draft: "草稿", scheduled: "已排程", published: "已發布", expired: "已到期", cancelled: "已取消", archived: "已封存" };
const successLabels: Record<string, string> = { created: "草稿已建立。", updated: "公告已更新並保留版本。", scheduled: "公告已排程。", published: "公告已發布並解析受眾。", cancelled: "公告已取消。", archived: "公告已封存。", retry_queued: "失敗送達已重新排入 bounded queue。" };

export default async function ManageAnnouncementDetailPage({ params, searchParams }: { params: Promise<{ announcementId: string }>; searchParams: Promise<{ clubId?: string; success?: string; error?: string }> }) {
  await requireIdentity(); const { announcementId } = await params; const query = await searchParams;
  if (!query.clubId) return <div className="page-stack"><Link className="back-link" href="/announcements/manage">← 返回管理</Link><Notice tone="error">缺少扶輪社識別，無法管理公告。</Notice></div>;
  const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_announcement_clubs");
  const manageableClubs = clubsResult.error ? null : ((clubsResult.data ?? []) as { club_id: string; can_manage: boolean }[])
    .filter((club) => club.can_manage);
  if (manageableClubs !== null && !manageableClubs.some((club) => club.club_id === query.clubId)) {
    redirect("/access-denied?reason=announcement_manage_required");
  }
  const [detailResult, summaryResult, membersResult] = await Promise.all([
    supabase.rpc("get_manageable_announcement", { p_club_id: query.clubId, p_announcement_id: announcementId }),
    supabase.rpc("get_announcement_delivery_summary", { p_club_id: query.clubId, p_announcement_id: announcementId }),
    supabase.rpc("list_club_members", { p_club_id: query.clubId, p_query: null, p_status: "active" }),
  ]);
  const announcement = detailResult.error ? null : parseManageableAnnouncement(detailResult.data);
  const summary = summaryResult.error ? null : parseDeliverySummary(summaryResult.data);
  const members = membersResult.error ? [] : (membersResult.data ?? []) as Member[];
  if (!announcement) return <div className="page-stack"><Link className="back-link" href={`/announcements/manage?clubId=${query.clubId}`}>← 返回管理</Link><Notice tone="error">公告不存在或您沒有管理權限。</Notice></div>;
  const editable = announcement.status === "draft" || announcement.status === "scheduled";
  const firstAudience = announcement.audiences[0] ?? { type: "all_active_members" };
  return <div className="page-stack"><Link className="back-link" href={`/announcements/manage?clubId=${announcement.club_id}`}>← 返回公告管理</Link>
    <header className="page-header"><div><p className="eyebrow">版本化公告</p><h1>{announcement.title}</h1><div className="status-pair"><Badge tone={announcement.status === "published" ? "success" : announcement.status === "cancelled" ? "danger" : "warning"}>{statusLabels[announcement.status] ?? announcement.status}</Badge><span className="hint">更新 {formatAnnouncementTime(announcement.updated_at)}</span></div></div></header>
    {query.success && <Notice tone="success">{successLabels[query.success] ?? "操作已完成。"}</Notice>}{query.error && <Notice tone="error">操作未完成；請檢查權限、輸入與目前狀態。</Notice>}
    {editable && <Card><div className="section-heading"><h2>編輯內容與受眾</h2><span>{announcement.status === "scheduled" ? "排程修改會新增 version 與 audit" : "草稿"}</span></div><form className="form-stack" action={updateAnnouncementAction}><input type="hidden" name="clubId" value={announcement.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><label className="field"><span className="label">標題</span><input className="input" name="title" defaultValue={announcement.title} maxLength={160} required /></label><label className="field"><span className="label">內容</span><textarea className="input" name="body" defaultValue={announcement.body} rows={10} maxLength={12000} required /></label><div className="form-grid"><label className="field"><span className="label">排程時間</span><input className="input" name="publishAt" type="datetime-local" defaultValue={announcementTimeInput(announcement.publish_at)} required={announcement.status === "scheduled"} /></label><label className="field"><span className="label">到期時間</span><input className="input" name="expireAt" type="datetime-local" defaultValue={announcementTimeInput(announcement.expire_at)} /></label><label className="field"><span className="label">置頂至</span><input className="input" name="pinnedUntil" type="datetime-local" defaultValue={announcementTimeInput(announcement.pinned_until)} /></label></div>
      <fieldset className="card"><legend className="label">目前受眾（更新會保留舊版本）</legend><label className="checkbox-row"><input type="radio" name="audienceType" value="all_active_members" defaultChecked={firstAudience.type === "all_active_members"} />全體有效社員</label><label className="checkbox-row"><input type="radio" name="audienceType" value="role" defaultChecked={firstAudience.type === "role"} />指定職務</label><select className="input" name="roleKey" defaultValue={firstAudience.role_key ?? "member"}><option value="president">社長</option><option value="secretary">秘書</option><option value="finance">財務</option><option value="member">社員</option></select><label className="checkbox-row"><input type="radio" name="audienceType" value="membership" defaultChecked={firstAudience.type === "membership"} />指定社員</label><select className="input" name="membershipId" defaultValue={firstAudience.membership_id ?? members[0]?.membership_id}>{members.map((member) => <option key={member.membership_id} value={member.membership_id}>{member.display_name}</option>)}</select></fieldset><div className="form-actions"><button className="button" type="submit">儲存新版本</button></div></form></Card>}
    <section><div className="section-heading"><h2>狀態操作</h2><span>每項敏感操作都需第二次確認</span></div><div className="club-grid">
      {announcement.status === "draft" && <Card><h3>排程發布</h3><p>到達指定時間後，由本機 bounded worker claim 與發布。</p><details><summary>繼續排程</summary><form className="form-stack" action={scheduleAnnouncementAction}><input type="hidden" name="clubId" value={announcement.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="confirmation" value="yes" /><input className="input" name="publishAt" type="datetime-local" required /><button className="button" type="submit">確認排程</button></form></details></Card>}
      {announcement.status === "draft" || announcement.status === "scheduled" ? <Card><h3>立即發布</h3><p>可信任 transaction 會鎖定公告、解析受眾並去重通知與送達。</p><details><summary>繼續發布</summary><form action={publishAnnouncementAction}><input type="hidden" name="clubId" value={announcement.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="confirmation" value="yes" /><button className="button" type="submit">確認立即發布</button></form></details></Card> : null}
      {!["cancelled", "archived", "expired"].includes(announcement.status) && <Card><h3>取消公告</h3><p>取消必須填寫原因；已建立的歷史不刪除。</p><details><summary>繼續取消</summary><form className="form-stack" action={cancelAnnouncementAction}><input type="hidden" name="clubId" value={announcement.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="confirmation" value="yes" /><input className="input" name="reason" maxLength={500} required placeholder="取消原因" /><button className="button button-danger" type="submit">確認取消</button></form></details></Card>}
      {["published", "expired", "cancelled"].includes(announcement.status) && <Card><h3>封存公告</h3><p>封存後不再出現在社員 active list，歷史仍保留。</p><details><summary>繼續封存</summary><form action={archiveAnnouncementAction}><input type="hidden" name="clubId" value={announcement.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="confirmation" value="yes" /><button className="button" type="submit">確認封存</button></form></details></Card>}
      {summary && summary.failed_count > 0 && <Card><h3>重試失敗送達</h3><p>只重置 failed rows；sent 永不重新 claim。</p><details><summary>繼續重試</summary><form action={retryAnnouncementDeliveriesAction}><input type="hidden" name="clubId" value={announcement.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><input type="hidden" name="confirmation" value="yes" /><button className="button" type="submit">確認重新排隊</button></form></details></Card>}
    </div></section>
    {summary && <section><div className="section-heading"><h2>已讀與送達統計</h2><span>只回傳一般化 counts</span></div><div className="metric-grid attendance-metrics"><Card><span className="metric-label">受眾通知</span><strong className="metric-value">{summary.recipient_count}</strong></Card><Card><span className="metric-label">未讀</span><strong className="metric-value">{summary.unread_count}</strong></Card><Card><span className="metric-label">已送達 mock</span><strong className="metric-value">{summary.sent_count}</strong></Card><Card><span className="metric-label">失敗</span><strong className="metric-value">{summary.failed_count}</strong></Card></div></section>}
    <section><div className="section-heading"><h2>Version history</h2><span>{announcement.versions.length} 版</span></div>{announcement.versions.length === 0 ? <Notice>尚無版本。</Notice> : <div className="table-wrap"><table><thead><tr><th>版本</th><th>狀態轉換</th><th>標題</th><th>建立時間</th></tr></thead><tbody>{announcement.versions.map((version) => <tr key={version.version_number}><td>v{version.version_number}</td><td>{version.transition}</td><td>{version.title}</td><td>{formatAnnouncementTime(version.created_at)}</td></tr>)}</tbody></table></div>}</section>
    <section><div className="section-heading"><h2>Audit history</h2><span>不含公告 body 或 recipient identity</span></div>{announcement.audit.length === 0 ? <Notice>尚無 audit。</Notice> : <div className="table-wrap"><table><thead><tr><th>動作</th><th>一般化摘要</th><th>時間</th></tr></thead><tbody>{announcement.audit.map((item, index) => <tr key={`${item.created_at}-${index}`}><td>{item.action}</td><td><code>{JSON.stringify(item.metadata)}</code></td><td>{formatAnnouncementTime(item.created_at)}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
