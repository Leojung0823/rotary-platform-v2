import QRCode from "qrcode";
import Link from "next/link";
import Image from "next/image";
import { cancelMemberInvitationAction, resendMemberInvitationAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { CopyLink } from "@/components/copy-link";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { safeMessage } from "@/lib/validation";

type Invitation = { invitation_id: string; membership_id: string; display_name: string; delivery_method: string; invitation_status: string; expires_at: string; sent_at: string | null; accepted_at: string | null };
const labels: Record<string, string> = { sent: "未接受", pending: "待寄送", accepted: "已接受", expired: "已過期", cancelled: "已取消" };

export default async function InvitationsPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ error?: string; success?: string; token?: string; invitation?: string }> }) {
  const { clubId } = await params; const query = await searchParams; const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_member_invitations", { p_club_id: clubId });
  if (error) return <Notice tone="error">您沒有管理邀請的權限。</Notice>; const invitations = (data ?? []) as Invitation[];
  const inviteUrl = query.token ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/join?token=${query.token}` : null;
  const qr = inviteUrl ? await QRCode.toDataURL(inviteUrl, { width: 320, margin: 2, errorCorrectionLevel: "M" }) : null;
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">Invitation First</p><h1>社員邀請</h1><p>建立、重送、取消並追蹤邀請；token 只在建立或重送後顯示一次。</p></div><Link className="button" href={`/clubs/${clubId}/members/new`}>＋ 建立邀請</Link></header><ClubAdminNav clubId={clubId}/>{query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}{query.success === "cancelled" && <Notice tone="success">邀請已取消。</Notice>}{inviteUrl && qr && <Card><h2>{query.success === "resent" ? "新的邀請連結" : "邀請已建立"}</h2><Notice>請使用 LINE、Email 或現場 QR Code 安全傳送。離開頁面後不再顯示原始 token。</Notice><div className="token-panel"><Image src={qr} width={160} height={160} unoptimized alt="社員加入邀請 QR Code"/><div><div className="token-value">{inviteUrl}</div><div className="form-actions"><CopyLink value={inviteUrl}/><a className="button line-button" href={`https://line.me/R/share?text=${encodeURIComponent(`請接受扶輪社邀請：${inviteUrl}`)}`}>用 LINE 分享</a></div></div></div></Card>}<div className="table-wrap"><table><thead><tr><th>社員</th><th>方式</th><th>狀態</th><th>到期</th><th>操作</th></tr></thead><tbody>{invitations.map(invitation => <tr key={invitation.invitation_id}><td><strong>{invitation.display_name}</strong></td><td>{invitation.delivery_method}</td><td><Badge tone={invitation.invitation_status === "accepted" ? "success" : invitation.invitation_status === "sent" ? "warning" : "neutral"}>{labels[invitation.invitation_status] ?? invitation.invitation_status}</Badge></td><td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(invitation.expires_at))}</td><td><details className="dropdown"><summary>管理</summary><div className="dropdown-panel"><form action={resendMemberInvitationAction} className="form-stack"><input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="invitationId" value={invitation.invitation_id}/><Field label="重送方式"><Select name="deliveryMethod" defaultValue={invitation.delivery_method}><option value="line">LINE</option><option value="email">Email</option><option value="qr">QR</option><option value="link">連結</option></Select></Field><Button type="submit">重送並旋轉 token</Button></form><hr/><form action={cancelMemberInvitationAction} className="form-stack"><input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="invitationId" value={invitation.invitation_id}/><Field label="取消原因"><Input name="reason" required/></Field><Button type="submit" className="button-danger">取消邀請</Button></form></div></details></td></tr>)}</tbody></table></div></div>;
}
