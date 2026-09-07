import { Card } from "@/components/ui";

/**
 * A failed role projection must stop at one coherent, non-authorizing screen.
 * Rendering the legacy shell around a newer route can make the navigation and
 * page disagree about the caller's club or role. The auth session remains
 * intact; a full reload is the only action offered so the projection is read
 * again from the server.
 */
export function ContextUnavailableScreen() {
  return <main className="center-page context-unavailable-page">
    <Card className="context-unavailable-card">
      <p className="eyebrow">工作台暫時無法載入</p>
      <h1>請重新整理</h1>
      <p>
        我們已保留您的登入狀態，但目前無法確認您要使用的角色與扶輪社。
        為了避免顯示錯誤資料，這次先不開啟工作台。
      </p>
      <p className="hint">如果重新整理後仍然無法進入，請聯絡社務管理員或平台管理員。</p>
      <a className="button" href="/dashboard">重新整理工作台</a>
    </Card>
  </main>;
}
