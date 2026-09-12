import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "加入扶輪社", referrer: "no-referrer" };

type Preview =
  | { usable: true; club_id: string; club_name: string }
  | { usable: false; reason: string };

export default async function JoinClubPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const supabase = await createClient();
  // The preview answers only "is this token usable, and for which club". A bad
  // token and a switched-off one look identical, so the page cannot be used to
  // probe which clubs exist.
  const { data } = await supabase.rpc("preview_club_join_link", { p_token: token });
  const preview = data as Preview | null;

  if (!preview?.usable) {
    return <main className="center-page"><Card className="accept-card">
      <h1>連結無法使用</h1>
      <p>這個加入連結不存在，或已經被扶輪社關閉。請向社務管理員索取新的連結。</p>
      <Link className="button button-secondary" href="/login">前往登入</Link>
    </Card></main>;
  }

  return <main className="center-page"><Card className="accept-card">
    <p className="eyebrow">加入扶輪社</p>
    <h1>{preview.club_name}</h1>
    <p>使用 LINE 登入即可加入本社。系統會把您的 LINE 顯示名稱帶入姓名，之後可以在「我的資料」修改。</p>

    <Notice>
      加入後，您會成為本社的正式社友，可以看到社員名錄與社內公告；社員名錄也會顯示您的姓名。
    </Notice>

    <form action="/api/auth/line/start" method="GET">
      <input type="hidden" name="join" value={token} />
      <Button type="submit">使用 LINE 登入並加入</Button>
    </form>

    <p className="muted">已經是社友？<Link href="/login">直接登入</Link></p>
  </Card></main>;
}
