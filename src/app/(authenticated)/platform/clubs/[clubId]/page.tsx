import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveClubAction, unarchiveClubAction, updateClubNameAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import { Badge, Button, Card, Field, Input, Notice } from "@/components/ui";

type Status = { club_id: string; club_code: string; club_name: string; club_status: string; active_operator_count: number; pending_invitation_count: number; activated_at: string | null };

const statusLabel: Record<string, string> = {
  provisioning: "建置中",
  active: "已啟用",
  suspended: "已停權",
  archived: "已封存",
};
const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  provisioning: "warning",
  active: "success",
  suspended: "warning",
  archived: "neutral",
};

const successMessages: Record<string, string> = {
  club_created: "扶輪社已建立，執行秘書帳號已設定完成。",
  renamed: "扶輪社名稱已更新。",
  archived: "扶輪社已封存，社員與活動功能已暫停。",
  unarchived: "扶輪社已恢復啟用。",
};

export default async function ClubStatusPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { clubId } = await params; const query = await searchParams;
  const supabase = await createClient(); const { data, error } = await supabase.rpc("get_club_provisioning_status", { p_club_id: clubId });
  if (error || !data) notFound(); const status = data as Status;
  const isLocal = process.env.APP_ENV === "local";
  return <div className="page-stack"><header className="page-header"><div><Link href="/platform/clubs" className="back-link">← 返回扶輪社列表</Link><p className="eyebrow">{status.club_code}</p><h1>{status.club_name}</h1></div><Badge tone={statusTone[status.club_status] ?? "neutral"}>{statusLabel[status.club_status] ?? status.club_status}</Badge></header>{query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}{query.success && <Notice tone="success">{successMessages[query.success] ?? "操作已完成。"}</Notice>}<div className="metric-grid"><Card><span className="metric-label">啟用中執行秘書</span><strong className="metric-value">{status.active_operator_count}</strong></Card><Card><span className="metric-label">尚未完成設定</span><strong className="metric-value">{status.pending_invitation_count}</strong></Card></div><Card><h2>建置進度</h2><ol className="steps"><li className="done">扶輪社資料已建立</li><li className={status.club_status === "active" ? "done" : "current"}>執行秘書帳號已設定，扶輪社已啟用</li></ol><div className="form-actions">{isLocal && <a className="button button-secondary" href="http://localhost:54324" target="_blank" rel="noreferrer">開啟 Mailpit</a>}<Link className="button" href={`/clubs/${clubId}/operators`}>管理執行秘書</Link></div></Card><Card><h2>扶輪社名稱</h2><form action={updateClubNameAction} className="inline-form"><input type="hidden" name="clubId" value={clubId}/><Field label="名稱"><Input name="clubName" required minLength={2} maxLength={100} defaultValue={status.club_name}/></Field><Button type="submit">儲存名稱</Button></form></Card><Card><h2>封存</h2><p>封存後這個扶輪社的社員與活動功能會立即停用；可隨時恢復，資料不會遺失。</p><form action={status.club_status === "archived" ? unarchiveClubAction : archiveClubAction}><input type="hidden" name="clubId" value={clubId}/><Button type="submit" className={status.club_status === "archived" ? "button-secondary" : "button-danger"} disabled={status.club_status === "provisioning"}>{status.club_status === "archived" ? "恢復啟用" : "封存這個扶輪社"}</Button></form></Card></div>;
}
