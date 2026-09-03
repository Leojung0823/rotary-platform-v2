import { inviteOperatorAction, revokeOperatorAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import { Badge, Button, Card, EmptyState, Field, Input, Notice } from "@/components/ui";

type Operator = { permission_id: string; display_name: string; email: string; permission_level: string; assignment_status: string; starts_at: string; revoked_at: string | null };
type Invite = { invite_id: string; display_name: string; email: string; invite_status: string; expires_at: string; created_at: string };
type Management = { operators: Operator[]; invitations: Invite[] };

function statusLabel(status: string) { return ({ active: "啟用中", revoked: "已撤銷", pending: "待寄送", sent: "待接受", accepted: "已接受", expired: "已過期", failed: "寄送失敗" } as Record<string, string>)[status] ?? status; }

export default async function OperatorsPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { clubId } = await params; const query = await searchParams;
  const supabase = await createClient();
  const [{ data: status }, { data, error }] = await Promise.all([
    supabase.rpc("get_club_provisioning_status", { p_club_id: clubId }),
    supabase.rpc("list_club_operators_and_invitations", { p_club_id: clubId }),
  ]);
  if (error || !data || !status) return <Notice tone="error">您沒有管理這個扶輪社的權限。</Notice>;
  const club = status as { club_name: string; club_code: string; club_status: string };
  const management = data as Management;
  const successMessages: Record<string, string> = { invited: "帳號已建立，管理權限已啟用。", accepted: "邀請已接受，扶輪社管理權限已啟用。", revoked: "執行秘書權限已撤銷，歷史紀錄已保留。" };
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">{club.club_code} · 社級管理</p><h1>{club.club_name}</h1><p>每位執行秘書都使用自己的帳號；權限異動會留下稽核紀錄。</p></div><Badge tone={club.club_status === "active" ? "success" : "warning"}>{club.club_status === "active" ? "已啟用" : "建置中"}</Badge></header>{query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}{query.success && <Notice tone="success">{successMessages[query.success] ?? "操作已完成。"}</Notice>}
  <Card><h2>新增執行秘書</h2><p className="subtle">社友可以同時擔任執行秘書，包含本社與其他社的社友。直接設定帳號密碼，不寄送邀請信；請自行將帳密告知執行秘書。</p><form action={inviteOperatorAction} className="form-stack"><input type="hidden" name="clubId" value={clubId}/><div className="form-grid"><Field label="姓名"><Input name="displayName" required /></Field><Field label="電子郵件"><Input name="email" type="email" required /></Field><Field label="密碼" hint="至少 12 個字元"><Input name="password" type="password" required minLength={12} autoComplete="new-password" /></Field><Field label="確認密碼"><Input name="passwordConfirmation" type="password" required minLength={12} autoComplete="new-password" /></Field></div><div className="form-actions"><Button type="submit">建立帳號</Button></div></form></Card>
  <section><div className="section-heading"><h2>執行秘書</h2><span>{management.operators.filter(item => item.assignment_status === "active").length} 位啟用中</span></div>{management.operators.length === 0 ? <EmptyState title="尚無執行秘書" body="等待第一位受邀者接受邀請。"/> : <div className="table-wrap"><table><thead><tr><th>姓名</th><th>帳號</th><th>權限</th><th>狀態</th><th>操作</th></tr></thead><tbody>{management.operators.map(operator => <tr key={operator.permission_id}><td><strong>{operator.display_name}</strong></td><td>{operator.email}</td><td>{operator.permission_level === "club_manager" ? "社級管理員" : "唯讀"}</td><td><Badge tone={operator.assignment_status === "active" ? "success" : "neutral"}>{statusLabel(operator.assignment_status)}</Badge></td><td>{operator.assignment_status === "active" && <details className="dropdown"><summary>管理</summary><form action={revokeOperatorAction} className="dropdown-panel"><input type="hidden" name="clubId" value={clubId}/><input type="hidden" name="permissionId" value={operator.permission_id}/><Field label="撤銷原因"><Input name="reason" required minLength={2}/></Field><p>撤銷後保留歷史，且無法由一般社級管理員撤銷最後一位啟用中的執行秘書。</p><Button className="button-danger" type="submit">確認撤銷</Button></form></details>}</td></tr>)}</tbody></table></div>}</section>
  <section><div className="section-heading"><h2>邀請紀錄</h2></div><div className="table-wrap"><table><thead><tr><th>受邀者</th><th>電子郵件</th><th>狀態</th><th>到期時間</th></tr></thead><tbody>{management.invitations.map(invite => <tr key={invite.invite_id}><td>{invite.display_name}</td><td>{invite.email}</td><td><Badge tone={invite.invite_status === "accepted" ? "success" : invite.invite_status === "sent" ? "warning" : "neutral"}>{statusLabel(invite.invite_status)}</Badge></td><td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invite.expires_at))}</td></tr>)}</tbody></table></div></section></div>;
}
