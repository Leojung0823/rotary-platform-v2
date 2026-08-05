import Link from "next/link";
import { Card } from "@/components/ui";

const messages: Record<string, { title: string; body: string }> = {
  account_inactive: {
    title: "帳號目前未啟用",
    body: "此平台帳號已被暫停或停用，所有社員與管理功能都已停止。請聯絡扶輪社秘書或平台管理員確認。",
  },
  no_active_access: {
    title: "目前沒有有效社籍",
    body: "您的帳號目前沒有可使用的扶輪社社籍。請聯絡所屬扶輪社秘書協助確認。",
  },
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const query = await searchParams;
  const message = messages[query.reason ?? ""] ?? {
    title: "無法存取",
    body: "您的帳號沒有查看這個頁面的權限。若您剛收到邀請，請確認登入信箱與邀請信箱相同。",
  };

  return <main className="center-page">
    <Card className="accept-card">
      <div className="empty-icon">!</div>
      <h1>{message.title}</h1>
      <p>{message.body}</p>
      <div className="form-actions">
        <Link className="button button-secondary" href="/login">返回登入</Link>
        <form method="post" action="/api/auth/line/logout?redirect=1">
          <button className="button" type="submit">重新登入</button>
        </form>
      </div>
    </Card>
  </main>;
}
