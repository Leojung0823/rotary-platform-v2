import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import { Badge, Card, Notice } from "@/components/ui";

type Status = { club_id: string; club_code: string; club_name: string; club_status: string; active_operator_count: number; pending_invitation_count: number; activated_at: string | null };
export default async function ClubStatusPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { clubId } = await params; const query = await searchParams;
  const supabase = await createClient(); const { data, error } = await supabase.rpc("get_club_provisioning_status", { p_club_id: clubId });
  if (error || !data) notFound(); const status = data as Status;
  const isLocal = process.env.APP_ENV === "local";
  return <div className="page-stack"><header className="page-header"><div><Link href="/platform/clubs" className="back-link">← 返回扶輪社列表</Link><p className="eyebrow">{status.club_code}</p><h1>{status.club_name}</h1></div><Badge tone={status.club_status === "active" ? "success" : "warning"}>{status.club_status === "active" ? "已啟用" : "建置中"}</Badge></header>{query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}{query.success && <Notice tone="success">扶輪社已建立，邀請信已寄出{isLocal ? "至本機 Mailpit" : ""}。</Notice>}<div className="metric-grid"><Card><span className="metric-label">啟用中執行秘書</span><strong className="metric-value">{status.active_operator_count}</strong></Card><Card><span className="metric-label">待接受邀請</span><strong className="metric-value">{status.pending_invitation_count}</strong></Card></div><Card><h2>建置進度</h2><ol className="steps"><li className="done">扶輪社資料已建立</li><li className={status.pending_invitation_count ? "current" : "done"}>執行秘書邀請已寄出</li><li className={status.club_status === "active" ? "done" : ""}>執行秘書接受邀請並啟用扶輪社</li></ol><div className="form-actions">{isLocal && <a className="button button-secondary" href="http://localhost:54324" target="_blank" rel="noreferrer">開啟 Mailpit</a>}<Link className="button" href={`/clubs/${clubId}/operators`}>管理執行秘書</Link></div></Card></div>;
}
