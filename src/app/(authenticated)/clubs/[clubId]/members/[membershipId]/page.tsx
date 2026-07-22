import Link from "next/link";
import { notFound } from "next/navigation";
import { assignClubRoleAction, setMemberStatusAction, unbindLineIdentityAction, updateMemberAction } from "@/app/actions";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import type { MemberRow } from "../page";

export default async function MemberDetailPage({ params, searchParams }: {
  params: Promise<{ clubId: string; membershipId: string }>;
  searchParams: Promise<{ error?: string; success?: string; token?: string }>;
}) {
  const { clubId, membershipId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data, error }, permissions] = await Promise.all([
    supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: null }),
    supabase.rpc("list_my_permissions", { p_club_id: clubId }),
  ]);
  if (error) return <Notice tone="error">您沒有查看此社員的權限。</Notice>;
  const member = ((data ?? []) as MemberRow[]).find((item) => item.membership_id === membershipId);
  if (!member) notFound();
  const canManageRoles = !permissions.error && ((permissions.data ?? []) as { permission_key: string }[])
    .some((item) => item.permission_key === "role.manage");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return <div className="page-stack">
    <header className="page-header"><div>
      <Link href={`/clubs/${clubId}/members`} className="back-link">← 返回社員列表</Link>
      <p className="eyebrow">社員身份</p><h1>{member.display_name}</h1>
      <div className="status-pair">
        <Badge tone={member.membership_status === "active" ? "success" : "warning"}>{member.membership_status}</Badge>
        <Badge tone="neutral">{member.role_key}</Badge>
        <Badge tone={member.line_identity_id ? "success" : "neutral"}>LINE {member.line_identity_id ? "已綁定" : "未綁定"}</Badge>
        <Badge tone={member.oa_follower_id ? "success" : "neutral"}>OA {member.oa_follower_id ? "已配對" : "未配對"}</Badge>
      </div>
    </div></header>
    <ClubAdminNav clubId={clubId}/>
    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}
    {query.success === "updated" && <Notice tone="success">社員資料已更新。</Notice>}
    {query.success === "role_updated" && <Notice tone="success">社員角色與權限已更新。</Notice>}
    {query.success === "unbound" && <Notice tone="success">LINE Login 已解除、所有 session 已失效，歷史資料與社籍均保留。</Notice>}
    {query.token && <Card><h2>重新綁定邀請</h2><p>請安全地將此一次性連結交給社員：</p>
      <div className="token-value">{`${siteUrl}/join?token=${query.token}`}</div></Card>}
    <div className="two-column">
      <Card><h2>基本資料</h2><form action={updateMemberAction} className="form-stack">
        <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/>
        <Field label="姓名"><Input name="name" required defaultValue={member.display_name}/></Field>
        <Field label="手機"><Input name="phone" defaultValue={member.phone ?? ""}/></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={member.email ?? ""}/></Field>
        <Field label="生日"><Input name="birthDate" type="date" defaultValue={member.birth_date ?? ""}/></Field>
        <Button type="submit">儲存資料</Button>
      </form></Card>
      <div className="page-stack">
        <Card><h2>社籍狀態</h2><form action={setMemberStatusAction} className="form-stack">
          <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/>
          <Field label="狀態"><Select name="status" defaultValue={member.membership_status}><option value="active">啟用</option><option value="suspended">暫停</option><option value="disabled">停用</option></Select></Field>
          <Field label="原因"><Input name="reason" required defaultValue="秘書後台調整"/></Field><Button type="submit">更新社籍狀態</Button>
        </form></Card>
        {canManageRoles && member.app_account_id && <Card><h2>RBAC 角色</h2><p>角色權限由資料庫矩陣決定；變更角色會撤銷此社員原有的社級角色。</p>
          <form action={assignClubRoleAction} className="form-stack">
            <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/><input type="hidden" name="accountId" value={member.app_account_id}/>
            <Field label="角色"><Select name="roleKey" defaultValue={member.role_key}><option value="president">社長</option><option value="secretary">秘書</option><option value="finance">財務</option><option value="member">一般社員</option></Select></Field>
            <Button type="submit">更新角色</Button>
          </form>
        </Card>}
        <Card><h2>LINE Login</h2>{member.line_identity_id && member.app_account_id ? <>
          <Notice tone="error">若無其他登入方式，解除後社員將無法登入。確認後系統會撤銷全部 session 並建立重新綁定邀請。</Notice>
          <form action={unbindLineIdentityAction} className="form-stack">
            <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/><input type="hidden" name="accountId" value={member.app_account_id}/>
            <Field label="解除原因"><Input name="reason" required/></Field><Button type="submit" className="button-danger">確認解除 LINE Login</Button>
          </form>
        </> : <p>尚未綁定。請從邀請管理重送加入或重新綁定邀請。</p>}</Card>
      </div>
    </div>
  </div>;
}
