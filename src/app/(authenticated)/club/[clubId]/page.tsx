import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Notice } from "@/components/ui";

export default async function ClubHomePage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { clubId } = await params; const query = await searchParams; const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_club_home", { p_club_id: clubId });
  if (error || !data) return <Notice tone="error">無法存取這個扶輪社。</Notice>; const club = data as { club_name: string; club_code: string };
  return <div className="page-stack">{query.welcome && <Notice tone="success">身份確認完成，歡迎加入 {club.club_name}。</Notice>}<header><p className="eyebrow">{club.club_code}</p><h1>{club.club_name}</h1><p>這裡是您的扶輪社首頁。V0.3 專注身份基礎，後續模組會直接建立在目前的權限與社籍上。</p></header><div className="club-grid"><Card><h2>我的資料卡</h2><p>管理個人資料、LINE Login、登入裝置、通知與隱私。</p><Link className="card-link" href="/me">開啟會員中心 →</Link></Card><Card><h2>身份狀態</h2><p>LINE Login 與扶輪社社籍已完成安全配對。</p></Card><Card><h2>下一步</h2><p>公告、例會、活動與生日等首頁內容將在後續產品版本實作。</p></Card></div></div>;
}
