import { Badge, Card, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { MemberRow } from "../members/page";

export default async function LineLoginAdminPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params; const supabase = await createClient(); const { data, error } = await supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: null });
  if (error) return <Notice tone="error">您無法查看社員的 LINE 登入狀態。</Notice>; const members = (data ?? []) as MemberRow[]; const bound = members.filter((member) => member.line_identity_id).length;
  return <div className="page-stack"><header><h1>LINE 登入</h1><p>查看社員是否已完成 LINE 登入連結；需要協助時可從社員管理重新發送邀請。</p></header><div className="metric-grid"><Card><span className="metric-label">已連結</span><strong className="metric-value">{bound}</strong></Card><Card><span className="metric-label">等待連結</span><strong className="metric-value">{members.length - bound}</strong></Card></div><div className="management-card-list">{members.map((member) => <article className="card attendance-row" key={member.membership_id}><div><h2>{member.display_name}</h2><p>{member.membership_status === "active" ? "有效社員" : "社籍目前未啟用"}</p></div><Badge tone={member.line_identity_id ? "success" : "neutral"}>{member.line_identity_id ? "已連結 LINE" : "等待邀請"}</Badge></article>)}</div></div>;
}
