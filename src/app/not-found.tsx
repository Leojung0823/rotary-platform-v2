import Link from "next/link";
export default function NotFound() { return <main className="center-page"><section className="accept-card"><p className="eyebrow">404</p><h1>找不到頁面</h1><p>這個頁面不存在，或您沒有權限查看其內容。</p><Link className="button" href="/dashboard">返回總覽</Link></section></main>; }
