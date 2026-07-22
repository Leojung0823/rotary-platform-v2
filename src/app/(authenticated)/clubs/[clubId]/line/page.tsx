import { createClient } from "@/lib/supabase/server";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Badge, Card, Notice } from "@/components/ui";
import type { MemberRow } from "../members/page";

export default async function LineLoginAdminPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params; const supabase = await createClient(); const { data, error } = await supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: null });
  if (error) return <Notice tone="error">您沒有查看 LINE 身份的權限。</Notice>; const members = (data ?? []) as MemberRow[];
  const bound = members.filter((member) => member.line_identity_id).length;
  return <div className="page-stack"><header><p className="eyebrow">身份驗證模組</p><h1>LINE Login</h1><p>只負責登入與身份綁定；不處理推播、好友或 Rich Menu。</p></header><ClubAdminNav clubId={clubId}/><div className="metric-grid"><Card><span className="metric-label">已綁定</span><strong className="metric-value">{bound}</strong></Card><Card><span className="metric-label">未綁定</span><strong className="metric-value">{members.length - bound}</strong></Card></div><Card><h2>OAuth 狀態</h2><div className="status-pair"><Badge tone="success">Session Rotation：Supabase Auth</Badge><Badge tone="success">CSRF：state cookie</Badge><Badge tone="success">Replay：nonce</Badge><Badge tone="success">ID Token：server verification</Badge><Badge tone={process.env.LINE_LOGIN_MODE === "line" ? "success" : "warning"}>{process.env.LINE_LOGIN_MODE === "line" ? "LINE v2.1" : "Local Mock Provider"}</Badge></div><p className="subtle">Production 模式使用 LINE OAuth 2.1 authorization code flow，server 端交換 token 並呼叫 LINE verify endpoint；access/refresh token 不寫入公開資料表。</p></Card><div className="table-wrap"><table><thead><tr><th>社員</th><th>LINE Login</th><th>社籍</th></tr></thead><tbody>{members.map(member => <tr key={member.membership_id}><td>{member.display_name}</td><td><Badge tone={member.line_identity_id ? "success" : "neutral"}>{member.line_identity_id ? "已綁定" : "等待邀請"}</Badge></td><td>{member.membership_status}</td></tr>)}</tbody></table></div></div>;
}
