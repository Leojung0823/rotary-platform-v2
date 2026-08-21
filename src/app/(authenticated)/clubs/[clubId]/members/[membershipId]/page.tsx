import Link from "next/link";
import { notFound } from "next/navigation";
import { assignClubRoleAction, setMemberStatusAction, unbindLineIdentityAction, updateMemberAction } from "@/app/actions";
import { setMemberAccountStatusAction } from "@/app/identity-actions";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { setMembershipTagsAction } from "@/app/tag-actions";

type MembershipTag = { tag_id: string; tag_name: string; description: string | null; assigned: boolean };
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import type { MemberRow } from "../page";

type AccountLifecycle = {
  has_account: boolean;
  account_id?: string;
  account_status?: string;
  membership_status: string;
  has_password_login?: boolean;
  line_identity_status?: string;
  line_display_name?: string | null;
  active_sessions?: number;
  active_devices?: number;
  shared_identity?: boolean;
  can_manage_account_status?: boolean;
  can_unbind_line?: boolean;
};

const statusLabel: Record<string, string> = {
  active: "啟用",
  suspended: "暫停",
  disabled: "停用",
};

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

  // Both depend on the membership having been found, so they go together.
  const [lifecycleResult, tagResult] = await Promise.all([
    supabase.rpc("get_member_account_lifecycle_admin", {
      p_club_id: clubId,
      p_membership_id: membershipId,
    }),
    supabase.rpc("get_membership_tag_assignment", {
      p_club_id: clubId,
      p_membership_id: membershipId,
    }),
  ]);
  const memberTags = ((tagResult.data as { tags?: MembershipTag[] } | null)?.tags ?? []) as MembershipTag[];
  const lifecycle = lifecycleResult.error || !lifecycleResult.data
    ? null
    : lifecycleResult.data as AccountLifecycle;
  const canManageRoles = !permissions.error && ((permissions.data ?? []) as { permission_key: string }[])
    .some((item) => item.permission_key === "role.manage");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return <div className="page-stack">
    <header className="page-header"><div>
      <Link href={`/clubs/${clubId}/members`} className="back-link">← 返回社員列表</Link>
      <p className="eyebrow">社員身份</p><h1>{member.display_name}</h1>
      <div className="status-pair">
        <Badge tone={member.membership_status === "active" ? "success" : "warning"}>{statusLabel[member.membership_status] ?? member.membership_status}</Badge>
        <Badge tone="neutral">{member.role_key}</Badge>
        <Badge tone={member.line_identity_id ? "success" : "neutral"}>LINE {member.line_identity_id ? "已綁定" : "未綁定"}</Badge>
        <Badge tone={member.oa_follower_id ? "success" : "neutral"}>OA {member.oa_follower_id ? "已配對" : "未配對"}</Badge>
      </div>
    </div></header>
    <ClubAdminNav clubId={clubId}/>
    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}
    {query.success === "updated" && <Notice tone="success">社員資料已更新。</Notice>}
    {query.success === "role_updated" && <Notice tone="success">社員角色與權限已更新。</Notice>}
    {query.success === "account_status_updated" && <Notice tone="success">平台帳號狀態已更新；停權時既有工作階段與裝置已立即撤銷。</Notice>}
    {query.success === "unbound" && <Notice tone="success">LINE Login 已解除、所有 session 已失效，歷史資料與社籍均保留。</Notice>}
    {query.success === "tags_saved" && <Notice tone="success">社員標籤已更新。</Notice>}

    <Card>
      <div className="section-heading">
        <div><p className="eyebrow">分眾</p><h2>標籤</h2></div>
        <Link href={`/clubs/${clubId}/members`}>管理標籤 →</Link>
      </div>
      {memberTags.length === 0
        ? <p className="subtle">這個扶輪社還沒有建立標籤。先在社員列表頁建立，才能用來指定活動與訊息的對象。</p>
        : <form action={setMembershipTagsAction} className="form-stack">
            <input type="hidden" name="clubId" value={clubId} />
            <input type="hidden" name="membershipId" value={membershipId} />
            {/* The whole set is submitted every time, so saving replaces the
                member's tags rather than merging with whatever was there when
                the page was opened. */}
            <div className="tag-picker">
              {memberTags.map((tag) => <label className="tag-option" key={tag.tag_id}>
                <input type="checkbox" name="tagIds" value={tag.tag_id} defaultChecked={tag.assigned} />
                <span>{tag.tag_name}</span>
              </label>)}
            </div>
            <div className="form-actions"><Button type="submit">儲存標籤</Button></div>
          </form>}
    </Card>
    {query.token && <Card><h2>重新綁定邀請</h2><p>請安全地將此一次性連結交給社員：</p>
      <div className="token-value">{`${siteUrl}/join?token=${query.token}`}</div></Card>}

    <div className="metric-grid">
      <Card><span className="metric-label">平台帳號</span><strong className="metric-value metric-text">{lifecycle?.has_account ? statusLabel[lifecycle.account_status ?? ""] ?? lifecycle.account_status : "尚未建立"}</strong></Card>
      <Card><span className="metric-label">有效 Session</span><strong className="metric-value">{lifecycle?.active_sessions ?? 0}</strong></Card>
      <Card><span className="metric-label">有效裝置</span><strong className="metric-value">{lifecycle?.active_devices ?? 0}</strong></Card>
    </div>

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
        <Card><h2>社籍狀態</h2><p>社籍暫停後會立即失去此扶輪社的社員功能；若沒有其他有效權限，系統也會撤銷全部登入工作階段。</p><form action={setMemberStatusAction} className="form-stack">
          <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/>
          <Field label="狀態"><Select name="status" defaultValue={member.membership_status}><option value="active">啟用</option><option value="suspended">暫停</option><option value="disabled">停用</option></Select></Field>
          <Field label="原因"><Input name="reason" required maxLength={500} defaultValue="秘書後台調整"/></Field><Button type="submit">更新社籍狀態</Button>
        </form></Card>

        {lifecycle?.has_account && <Card><h2>平台帳號生命週期</h2>
          <div className="status-pair">
            <Badge tone={lifecycle.account_status === "active" ? "success" : "danger"}>{statusLabel[lifecycle.account_status ?? ""] ?? lifecycle.account_status}</Badge>
            <Badge tone={lifecycle.has_password_login ? "success" : "neutral"}>{lifecycle.has_password_login ? "有密碼備援" : "僅 LINE／邀請登入"}</Badge>
            {lifecycle.shared_identity && <Badge tone="warning">跨社共用身份</Badge>}
          </div>
          <p>帳號停權是全平台狀態，會立即撤銷全部 Session 與裝置。跨社共用身份只能由平台管理員調整。</p>
          {lifecycle.can_manage_account_status ? <form action={setMemberAccountStatusAction} className="form-stack">
            <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/><input type="hidden" name="accountId" value={lifecycle.account_id}/>
            <Field label="帳號狀態"><Select name="status" defaultValue={lifecycle.account_status}><option value="active">啟用</option><option value="suspended">暫停</option><option value="disabled">停用</option></Select></Field>
            <Field label="原因"><Input name="reason" required maxLength={500} defaultValue="帳號生命週期調整"/></Field>
            <Button type="submit" className={lifecycle.account_status === "active" ? "button-danger" : "button-secondary"}>更新平台帳號</Button>
          </form> : <Notice>此帳號為本人、跨社共用身份或平台高權限帳號，目前操作者不能修改其全平台狀態。</Notice>}
        </Card>}

        {canManageRoles && member.app_account_id && <Card><h2>RBAC 角色</h2><p>角色權限由資料庫矩陣決定；變更角色會撤銷此社員原有的社級角色。</p>
          <form action={assignClubRoleAction} className="form-stack">
            <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/><input type="hidden" name="accountId" value={member.app_account_id}/>
            <Field label="角色"><Select name="roleKey" defaultValue={member.role_key}><option value="president">社長</option><option value="secretary">秘書</option><option value="finance">財務</option><option value="member">一般社員</option></Select></Field>
            <Button type="submit">更新角色</Button>
          </form>
        </Card>}

        <Card><h2>LINE Login</h2>{member.line_identity_id && member.app_account_id ? <>
          <Notice tone="error">解除後社員的全部 Session 與裝置會立即失效。系統會建立一次性重新綁定邀請，社籍與歷史資料均保留。</Notice>
          {lifecycle?.can_unbind_line !== false ? <form action={unbindLineIdentityAction} className="form-stack">
            <input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="membershipId" value={membershipId}/><input type="hidden" name="accountId" value={member.app_account_id}/>
            <Field label="解除原因"><Input name="reason" required maxLength={500}/></Field><Button type="submit" className="button-danger">確認解除 LINE Login</Button>
          </form> : <Notice>跨社共用 LINE 身份只能由平台管理員解除。</Notice>}
        </> : <p>尚未綁定。社員可在會員中心自行綁定，或從邀請管理重送加入／重新綁定邀請。</p>}</Card>
      </div>
    </div>
  </div>;
}
