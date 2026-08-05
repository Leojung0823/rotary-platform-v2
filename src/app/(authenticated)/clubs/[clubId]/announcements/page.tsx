import { archiveAnnouncementAction, publishAnnouncementAction, saveAnnouncementAction } from "@/app/announcement-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type Announcement = { id: string; title: string; body: string; status: "draft" | "published" | "archived"; pinned: boolean; requires_acknowledgement: boolean; published_at: string | null };

export default async function AnnouncementManagementPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireIdentity(); const [{ clubId }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  const result = await supabase.rpc("list_club_announcements", { p_club_id: clubId });
  const payload = !result.error && result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data as { can_manage?: boolean; announcements?: Announcement[] } : null;
  if (!payload?.can_manage) return <div className="page-stack"><Notice tone="error">您無法使用公告管理功能。</Notice></div>;
  return <div className="page-stack"><header><h1>公告管理</h1><p>建立、發布與封存社內公告。</p></header>{query.success && <Notice tone="success">公告已更新。</Notice>}{query.error && <Notice tone="error">操作未完成，請確認內容後再試一次。</Notice>}
    <section className="card"><h2>建立公告草稿</h2><form action={saveAnnouncementAction} className="form-stack"><input type="hidden" name="clubId" value={clubId} /><label className="field"><span className="label">公告標題</span><input className="input" name="title" maxLength={160} required /></label><label className="field"><span className="label">公告內容</span><textarea className="input" name="body" maxLength={5000} rows={7} required /></label><div className="form-grid"><label className="checkbox-row"><input type="checkbox" name="pinned" /><span><strong>置頂顯示</strong></span></label><label className="checkbox-row"><input type="checkbox" name="requiresAcknowledgement" /><span><strong>要求社員確認</strong></span></label><label className="field"><span className="label">顯示到（選填）</span><input className="input" type="datetime-local" name="expiresAt" /></label></div><button className="button" type="submit">儲存草稿</button></form></section>
    <section><div className="section-heading"><h2>公告清單</h2></div><div className="management-card-list">{payload.announcements?.map((item) => <article className="card" key={item.id}><div className="section-heading"><div><h2>{item.title}</h2><p>{item.body}</p></div><span className="badge badge-neutral">{item.status === "draft" ? "草稿" : item.status === "published" ? "已發布" : "已封存"}</span></div>{item.published_at && <p>{formatDateTime(item.published_at, true)}</p>}<div className="form-actions">{item.status === "draft" && <form action={publishAnnouncementAction}><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="announcementId" value={item.id} /><button className="button" type="submit">發布公告</button></form>}{item.status === "published" && <details className="danger-details"><summary>封存公告</summary><form action={archiveAnnouncementAction} className="form-stack"><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="announcementId" value={item.id} /><label className="field"><span className="label">封存原因</span><input className="input" name="reason" maxLength={500} required /></label><ConfirmSubmitButton className="button button-danger" type="submit" confirmMessage={`確定要封存「${item.title}」嗎？社員將不再看到這則公告。`}>確認封存</ConfirmSubmitButton></form></details>}</div></article>)}</div></section>
  </div>;
}
