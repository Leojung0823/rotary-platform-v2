import Link from "next/link";
import { Card } from "@/components/ui";
export default function AccessDeniedPage() { return <main className="center-page"><Card className="accept-card"><div className="empty-icon">!</div><h1>無法存取</h1><p>您的帳號沒有查看這個頁面的權限。若您剛收到邀請，請確認登入信箱與邀請信箱相同。</p><Link className="button" href="/dashboard">返回總覽</Link></Card></main>; }
