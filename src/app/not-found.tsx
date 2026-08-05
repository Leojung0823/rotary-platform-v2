import Link from "next/link";
export default function NotFound() { return <main className="center-page"><section className="card accept-card"><div className="empty-icon" aria-hidden="true">?</div><h1>找不到頁面</h1><p>這個連結可能已失效，或頁面已經移動。</p><Link className="button" href="/dashboard">回首頁</Link></section></main>; }
