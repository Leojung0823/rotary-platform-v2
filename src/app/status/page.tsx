import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { getHealthSnapshot } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const health = await getHealthSnapshot();
  const healthy = health.status === "ok";

  return <main className="page-stack" style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
    <header className="page-header">
      <div>
        <p className="eyebrow">部署狀態</p>
        <h1>扶輪管理平台系統狀態</h1>
        <p>此頁只顯示公開的環境與連線檢查，不會輸出金鑰、密碼、邀請 token 或社員資料。</p>
      </div>
      <Badge tone={healthy ? "success" : "warning"}>{healthy ? "系統正常" : "需要檢查"}</Badge>
    </header>

    <div className="metric-grid">
      <Card>
        <span className="metric-label">執行環境</span>
        <strong className="metric-value" style={{ fontSize: "1.5rem" }}>{health.environment.toUpperCase()}</strong>
      </Card>
      <Card>
        <span className="metric-label">環境設定</span>
        <strong className="metric-value" style={{ fontSize: "1.5rem" }}>{health.checks.configuration ? "正常" : "異常"}</strong>
      </Card>
      <Card>
        <span className="metric-label">資料庫連線</span>
        <strong className="metric-value" style={{ fontSize: "1.5rem" }}>{health.checks.database ? "正常" : "異常"}</strong>
      </Card>
    </div>

    {health.issues.length > 0 && <section className="notice notice-error">
      <strong>部署設定尚未完成：</strong> {health.issues.join("、")}
    </section>}
    {health.warnings.length > 0 && <section className="notice notice-info">
      <strong>提醒：</strong> {health.warnings.join("、")}
    </section>}

    <Card>
      <div className="section-heading"><h2>版本資訊</h2></div>
      <p>Revision：{health.revision ?? "本機或尚未提供部署版本"}</p>
      <p>檢查時間：{new Date(health.timestamp).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
    </Card>

    <div className="form-actions">
      <Link className="button" href="/login">前往登入</Link>
      <a className="button button-secondary" href="/api/health">查看 JSON 健康檢查</a>
    </div>
  </main>;
}
