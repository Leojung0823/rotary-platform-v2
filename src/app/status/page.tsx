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
        <p>這裡只告訴您服務目前能不能使用，不會顯示技術設定或社員資料。</p>
      </div>
      <Badge tone={healthy ? "success" : "warning"}>{healthy ? "系統正常" : "需要檢查"}</Badge>
    </header>

    <Card>
      <h2>目前狀態</h2>
      <p>{healthy
        ? "服務目前正常，可以登入並使用平台功能。"
        : "服務目前需要檢查，請稍後再試；如果持續發生，請聯絡平台管理員。"}
      </p>
      {health.issues.length > 0 && <div className="notice notice-error">
        <strong>目前無法完整提供服務。</strong>
      </div>}
      <p className="hint">最後檢查時間：{new Date(health.timestamp).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
    </Card>

    <div className="form-actions">
      <Link className="button" href="/login">前往登入</Link>
    </div>
  </main>;
}
