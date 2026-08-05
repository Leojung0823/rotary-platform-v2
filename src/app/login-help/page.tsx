import Link from "next/link";

export default function LoginHelpPage() {
  return <main id="main" className="center-page"><section className="card accept-card"><span className="brand-mark large" aria-hidden="true">R</span><h1>登入協助</h1><p>若您忘記電子郵件密碼，可先重新設定。若 LINE 登入或社籍狀態有問題，請聯絡所屬扶輪社秘書協助確認。</p><div className="form-stack"><Link className="button" href="/forgot-password">重新設定密碼</Link><Link className="button button-secondary" href="/login">返回登入</Link></div></section></main>;
}
