import Link from "next/link";
import { archiveMemberTagAction, createMemberTagAction } from "@/app/tag-actions";
import { createClient } from "@/lib/supabase/server";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Notice } from "@/components/ui";

export type MemberRow = { membership_id: string; person_id: string; app_account_id: string | null; line_identity_id: string | null; oa_follower_id: string | null; display_name: string; phone: string | null; email: string | null; birth_date: string | null; membership_status: string; role_key: string; line_login_status: string; oa_status: string; created_at: string };
const membershipLabel: Record<string, string> = { invited: "受邀中", active: "啟用", suspended: "暫停", disabled: "停用", ended: "已結束" };
type MemberTag = { tag_id: string; tag_name: string; description: string | null; member_count: number };
const tagMessages: Record<string, string> = {
  tag_created: "標籤已建立。",
  tag_archived: "標籤已封存；過去的活動與貼文仍保留當初的對象。",
  tags_saved: "社員標籤已更新。",
  tag_exists: "同名標籤已存在。",
  tag_missing: "找不到該標籤，可能已被封存。",
  invalid_input: "標籤名稱必填，且不可超過 40 字。",
  forbidden: "目前帳號沒有管理標籤的權限。",
  unexpected: "目前無法完成操作，請稍後再試。",
};

export default async function MembersPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ q?: string; status?: string; success?: string; error?: string }> }) {
  const { clubId } = await params; const query = await searchParams; const supabase = await createClient();
  // Issued together: the tag list is a separate question from the roster, and
  // waiting for one before asking the other would cost a round trip.
  const [membersResult, tagsResult] = await Promise.all([
    supabase.rpc("list_club_members", { p_club_id: clubId, p_query: query.q || null, p_status: query.status || null }),
    supabase.rpc("list_club_member_tags", { p_club_id: clubId }),
  ]);
  const { data, error } = membersResult;
  if (error) return <Notice tone="error">您沒有查看社員的權限。</Notice>; const members = (data ?? []) as MemberRow[];
  const tags = ((tagsResult.data as { tags?: MemberTag[] } | null)?.tags ?? []) as MemberTag[];
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">會員管理</p><h1>社員</h1><p>先由扶輪社建立已知資料，再邀請社員完成身份確認。</p></div><div className="form-actions"><a className="button button-secondary" href={`/api/v1/clubs/${clubId}/members/export`}>Excel 匯出</a><Link className="button" href={`/clubs/${clubId}/members/new`}>＋ 新增社員</Link></div></header><ClubAdminNav clubId={clubId}/>{query.success && <Notice tone="success">{tagMessages[query.success] ?? "社員狀態已更新。"}</Notice>}{query.error && <Notice tone="error">{tagMessages[query.error] ?? tagMessages.unexpected}</Notice>}<Card><div className="section-heading"><div><p className="eyebrow">分眾</p><h2>社員標籤</h2></div><span>{tags.length} 個標籤</span></div><p>標籤用來指定活動與訊息的對象，例如理事會、新社員。設定了對象的活動不是例會，不會計入出席。</p><form action={createMemberTagAction} className="inline-form"><input type="hidden" name="clubId" value={clubId}/><Field label="標籤名稱"><Input name="tagName" required maxLength={40} placeholder="例如：理事會"/></Field><Field label="說明（選填）"><Input name="description" maxLength={200} placeholder="例如：理事與監事"/></Field><Button type="submit">建立標籤</Button></form>{tags.length === 0 ? <p className="subtle">尚未建立任何標籤。</p> : <div className="table-wrap"><table><thead><tr><th>標籤</th><th>說明</th><th>人數</th><th></th></tr></thead><tbody>{tags.map(tag => <tr key={tag.tag_id}><td><strong>{tag.tag_name}</strong></td><td>{tag.description ?? "—"}</td><td>{tag.member_count}</td><td><form action={archiveMemberTagAction}><input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="tagId" value={tag.tag_id}/><Button className="button-secondary" type="submit">封存</Button></form></td></tr>)}</tbody></table></div>}</Card><form className="inline-form"><Input name="q" defaultValue={query.q} placeholder="搜尋姓名、手機或 Email"/><Select name="status" defaultValue={query.status ?? ""}><option value="">全部狀態</option><option value="active">啟用</option><option value="invited">受邀中</option><option value="suspended">暫停</option><option value="disabled">停用</option></Select><button className="button" type="submit">搜尋</button></form>{members.length === 0 ? <EmptyState title="找不到社員" body="調整搜尋條件，或新增第一位社員。"/> : <div className="table-wrap"><table><thead><tr><th>社員</th><th>聯絡方式</th><th>社籍</th><th>LINE Login</th><th>LINE OA</th><th></th></tr></thead><tbody>{members.map(member => <tr key={member.membership_id}><td><strong>{member.display_name}</strong></td><td>{member.phone ?? member.email ?? "—"}</td><td><Badge tone={member.membership_status === "active" ? "success" : "warning"}>{membershipLabel[member.membership_status] ?? member.membership_status}</Badge></td><td><Badge tone={member.line_identity_id ? "success" : "neutral"}>{member.line_identity_id ? "已綁定" : "未綁定"}</Badge></td><td><Badge tone={member.oa_follower_id ? "success" : "neutral"}>{member.oa_follower_id ? "已加入" : "未加入"}</Badge></td><td><Link href={`/clubs/${clubId}/members/${member.membership_id}`}>管理 →</Link></td></tr>)}</tbody></table></div>}</div>;
}
