import { createClient } from "@/lib/supabase/server";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Notice } from "@/components/ui";

type Audit = { id: number; action_key: string; actor_name: string | null; subject_type: string; metadata: Record<string, unknown>; created_at: string };
export default async function AuditPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params; const supabase = await createClient(); const { data, error } = await supabase.rpc("list_club_audit", { p_club_id: clubId, p_limit: 100 });
  if (error) return <Notice tone="error">您沒有查看 Audit Log 的權限。</Notice>; const logs = (data ?? []) as Audit[];
  return <div className="page-stack"><header><p className="eyebrow">不可變更的歷史</p><h1>Audit Log</h1><p>身份、邀請、權限、社籍、裝置與 LINE 操作均保留 actor、時間與安全摘要。</p></header><ClubAdminNav clubId={clubId}/><div className="table-wrap"><table><thead><tr><th>時間</th><th>操作</th><th>操作者</th><th>對象</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "medium" }).format(new Date(log.created_at))}</td><td><code>{log.action_key}</code></td><td>{log.actor_name ?? "系統"}</td><td>{log.subject_type}</td></tr>)}</tbody></table></div></div>;
}
