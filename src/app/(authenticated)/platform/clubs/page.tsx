import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPlatformAccess, requireIdentity } from "@/lib/auth";
import { Badge, EmptyState } from "@/components/ui";

type Club = { club_id: string; club_code: string; club_name: string; club_status: string; created_at: string };

export default async function PlatformClubsPage() {
  const identity = await requireIdentity();
  if (!hasPlatformAccess(identity)) redirect("/access-denied");
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_manageable_clubs");
  const clubs = (data ?? []) as Club[];
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">平台管理</p><h1>扶輪社</h1><p>建立新社、追蹤建置狀態並管理執行秘書。</p></div><Link className="button" href="/platform/clubs/new">＋ 建立扶輪社</Link></header>
    {clubs.length === 0 ? <EmptyState title="尚未建立扶輪社" body="建立第一個扶輪社並寄出執行秘書邀請。" /> : <div className="table-wrap"><table><thead><tr><th>扶輪社</th><th>代碼</th><th>狀態</th><th>建立日期</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{clubs.map(club => <tr key={club.club_id}><td><strong>{club.club_name}</strong></td><td><code>{club.club_code}</code></td><td><Badge tone={club.club_status === "active" ? "success" : "warning"}>{club.club_status === "active" ? "已啟用" : "建置中"}</Badge></td><td>{new Intl.DateTimeFormat("zh-TW").format(new Date(club.created_at))}</td><td><Link href={`/platform/clubs/${club.club_id}`}>查看 →</Link></td></tr>)}</tbody></table></div>}
  </div>;
}
