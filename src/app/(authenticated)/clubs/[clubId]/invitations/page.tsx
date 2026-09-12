import type { Metadata } from "next";
import QRCode from "qrcode";
import Link from "next/link";
import Image from "next/image";
import {
  cancelMemberInvitationAction,
  createClubJoinLinkAction,
  disableClubJoinLinkAction,
  resendMemberInvitationAction,
} from "@/app/actions";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { CopyLink } from "@/components/copy-link";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

export const metadata: Metadata = { referrer: "no-referrer" };

type Invitation = {
  invitation_id: string;
  membership_id: string;
  display_name: string;
  delivery_method: string;
  invitation_status: string;
  expires_at: string;
  sent_at: string | null;
  accepted_at: string | null;
};

const statusLabels: Record<string, string> = {
  sent: "未接受",
  pending: "待寄送",
  accepted: "已接受",
  expired: "已過期",
  cancelled: "已取消",
};

const deliveryLabels: Record<string, string> = {
  line: "LINE",
  email: "Email",
  qr: "QR Code",
  link: "連結",
};

function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "sent" || status === "pending") return "warning";
  return "neutral";
}

type JoinLinksProjection = {
  feature_enabled: boolean;
  links: Array<{
    id: string;
    token_prefix: string;
    link_status: "active" | "disabled";
    join_count: number;
    created_at: string;
    disabled_at: string | null;
  }>;
};

export default async function InvitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    error?: string; success?: string; token?: string; invitation?: string; joinToken?: string;
  }>;
}) {
  const { clubId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data, error }, joinLinksResult] = await Promise.all([
    supabase.rpc("list_member_invitations", { p_club_id: clubId }),
    supabase.rpc("get_club_join_links_admin", { p_club_id: clubId }),
  ]);
  const joinLinks = (joinLinksResult.data ?? null) as JoinLinksProjection | null;
  const activeJoinLink = joinLinks?.links.find((link) => link.link_status === "active") ?? null;
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const newJoinUrl = query.joinToken
    ? `${siteOrigin}/join-club?token=${encodeURIComponent(query.joinToken)}`
    : null;

  if (error) return <Notice tone="error">您沒有管理邀請的權限。</Notice>;
  const invitations = (data ?? []) as Invitation[];
  const inviteUrl = query.token
    ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/join?token=${query.token}`
    : null;
  const qr = inviteUrl
    ? await QRCode.toDataURL(inviteUrl, { width: 320, margin: 2, errorCorrectionLevel: "M" })
    : null;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">Invitation First</p>
        <h1>社員邀請</h1>
        <p>建立、重送、取消並追蹤邀請；原始 token 只在建立或重送後顯示一次。</p>
      </div>
      <Link className="button" href={`/clubs/${clubId}/members/new`}>＋ 建立邀請</Link>
    </header>

    <ClubAdminNav clubId={clubId} />

    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}
    {query.success === "cancelled" && <Notice tone="success">邀請已取消。</Notice>}
    {query.success === "join_link_disabled" && <Notice tone="success">加入連結已關閉，舊連結立即失效。</Notice>}

    {inviteUrl && qr && <Card>
      <h2>{query.success === "resent" ? "新的邀請連結" : "邀請已建立"}</h2>
      <Notice>請使用 LINE、Email 或現場 QR Code 安全傳送。離開頁面後不再顯示原始 token。</Notice>
      <div className="token-panel">
        <Image src={qr} width={160} height={160} unoptimized alt="社員加入邀請 QR Code" />
        <div>
          <div className="token-value">{inviteUrl}</div>
          <div className="form-actions">
            <CopyLink value={inviteUrl} />
            <a
              className="button line-button"
              rel="noreferrer"
              href={`https://line.me/R/share?text=${encodeURIComponent(`請接受扶輪社邀請：${inviteUrl}`)}`}
            >
              用 LINE 分享
            </a>
          </div>
        </div>
      </div>
    </Card>}

    {joinLinks?.feature_enabled && <Card>
      <h2>公開加入連結</h2>
      <p>任何拿到這條連結的人，都可以用 LINE 登入直接成為本社正式社友，姓名帶入其 LINE 顯示名稱。</p>
      <Notice tone="error">
        這條連結沒有使用次數上限，也不會自動過期，唯一的控制是下方的「關閉連結」。
        社友可以看到社員名錄，包含其他社員願意公開的 Email 與手機，
        所以連結流出等同把社內資料交出去。用完請立刻關閉。
      </Notice>

      {newJoinUrl && <>
        <Notice>連結只會在這裡顯示一次，離開頁面後無法再取得，需要時請重新建立。</Notice>
        <div className="token-panel">
          <div>
            <div className="token-value">{newJoinUrl}</div>
            <div className="form-actions"><CopyLink value={newJoinUrl} /></div>
          </div>
        </div>
      </>}

      {activeJoinLink
        ? <div className="form-actions">
          <Badge tone="success">啟用中</Badge>
          <span>識別碼 {activeJoinLink.token_prefix}，已有 {activeJoinLink.join_count} 人加入</span>
          <form action={disableClubJoinLinkAction}>
            <input type="hidden" name="clubId" value={clubId} />
            <input type="hidden" name="linkId" value={activeJoinLink.id} />
            <Button type="submit" className="button-secondary">關閉連結</Button>
          </form>
        </div>
        : <p className="muted">目前沒有啟用中的加入連結。</p>}

      <form action={createClubJoinLinkAction}>
        <input type="hidden" name="clubId" value={clubId} />
        <Button type="submit">{activeJoinLink ? "重新建立（舊連結立即失效）" : "建立加入連結"}</Button>
      </form>
    </Card>}

    <div className="table-wrap">
      <table>
        <thead><tr><th>社員</th><th>方式</th><th>狀態</th><th>到期</th><th>操作</th></tr></thead>
        <tbody>
          {invitations.map((invitation) => {
            const canResend = invitation.invitation_status !== "accepted";
            const canCancel = ["pending", "sent", "expired"].includes(invitation.invitation_status);

            return <tr key={invitation.invitation_id}>
              <td>
                <strong>{invitation.display_name}</strong>
                {invitation.accepted_at && <small>接受於 {new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(invitation.accepted_at))}</small>}
              </td>
              <td>{deliveryLabels[invitation.delivery_method] ?? invitation.delivery_method}</td>
              <td><Badge tone={statusTone(invitation.invitation_status)}>{statusLabels[invitation.invitation_status] ?? invitation.invitation_status}</Badge></td>
              <td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(invitation.expires_at))}</td>
              <td>
                {!canResend && !canCancel
                  ? <span>已完成</span>
                  : <details className="dropdown">
                    <summary>管理</summary>
                    <div className="dropdown-panel">
                      {canResend && <form action={resendMemberInvitationAction} className="form-stack">
                        <input type="hidden" name="clubId" value={clubId} />
                        <input type="hidden" name="invitationId" value={invitation.invitation_id} />
                        <Field label="重送方式">
                          <Select name="deliveryMethod" defaultValue={invitation.delivery_method}>
                            <option value="line">LINE</option>
                            <option value="email">Email</option>
                            <option value="qr">QR</option>
                            <option value="link">連結</option>
                          </Select>
                        </Field>
                        <Button type="submit">重送並旋轉 token</Button>
                      </form>}

                      {canCancel && <>
                        <hr />
                        <form action={cancelMemberInvitationAction} className="form-stack">
                          <input type="hidden" name="clubId" value={clubId} />
                          <input type="hidden" name="invitationId" value={invitation.invitation_id} />
                          <Field label="取消原因"><Input name="reason" required /></Field>
                          <Button type="submit" className="button-danger">取消邀請</Button>
                        </form>
                      </>}
                    </div>
                  </details>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}
