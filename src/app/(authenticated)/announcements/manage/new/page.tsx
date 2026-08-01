import Link from "next/link";
import { redirect } from "next/navigation";
import { createAnnouncementAction } from "@/app/announcement-actions";
import { Card, EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AnnouncementClub } from "@/lib/announcements/projections";

type Member = { membership_id: string; display_name: string; membership_status: string };

export default async function NewAnnouncementPage({ searchParams }: { searchParams: Promise<{ clubId?: string; error?: string }> }) {
  await requireIdentity(); const query = await searchParams; const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_announcement_clubs");
  const clubs = clubsResult.error ? null : (clubsResult.data ?? []) as AnnouncementClub[];
  const manageableClubs = clubs?.filter((club) => club.can_manage) ?? [];
  if (clubs !== null && manageableClubs.length === 0) redirect("/access-denied?reason=announcement_manage_required");
  const selected = manageableClubs.find((club) => club.club_id === query.clubId) ?? manageableClubs[0] ?? null;
  const membersResult = selected ? await supabase.rpc("list_club_members", { p_club_id: selected.club_id, p_query: null, p_status: "active" }) : null;
  const members = membersResult?.error ? [] : (membersResult?.data ?? []) as Member[];
  if (!selected) return <div className="page-stack"><Link className="back-link" href="/announcements/manage">← 返回管理</Link><EmptyState title="沒有可管理的扶輪社" body="需要有效的公告管理權限。" /></div>;
  return <div className="page-stack narrow"><Link className="back-link" href={`/announcements/manage?clubId=${selected.club_id}`}>← 返回公告管理</Link><header><p className="eyebrow">建立草稿</p><h1>新增公告</h1><p>先儲存草稿；發布或排程會在下一頁再次確認。</p></header>{query.error && <Notice tone="error">輸入不完整或您沒有該社管理權限。</Notice>}
    <Card><form className="form-stack" action={createAnnouncementAction}><label className="field"><span className="label">扶輪社</span><select className="input" name="clubId" defaultValue={selected.club_id}>{manageableClubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}</select></label><label className="field"><span className="label">標題</span><input className="input" name="title" maxLength={160} required /></label><label className="field"><span className="label">內容</span><textarea className="input" name="body" rows={10} maxLength={12000} required /></label>
      <div className="form-grid"><label className="field"><span className="label">到期時間（選填）</span><input className="input" name="expireAt" type="datetime-local" /></label><label className="field"><span className="label">置頂至（選填）</span><input className="input" name="pinnedUntil" type="datetime-local" /></label></div>
      <fieldset className="card"><legend className="label">受眾</legend><label className="checkbox-row"><input type="radio" name="audienceType" value="all_active_members" defaultChecked />全體有效社員</label><label className="checkbox-row"><input type="radio" name="audienceType" value="role" />指定職務</label><select className="input" name="roleKey" defaultValue="member"><option value="president">社長</option><option value="secretary">秘書</option><option value="finance">財務</option><option value="member">社員</option></select><label className="checkbox-row"><input type="radio" name="audienceType" value="membership" />指定社員</label><select className="input" name="membershipId" defaultValue={members[0]?.membership_id}>{members.map((member) => <option key={member.membership_id} value={member.membership_id}>{member.display_name}</option>)}</select></fieldset>
      <div className="form-actions"><Link className="button button-secondary" href={`/announcements/manage?clubId=${selected.club_id}`}>取消</Link><button className="button" type="submit">儲存草稿</button></div></form></Card>
  </div>;
}
