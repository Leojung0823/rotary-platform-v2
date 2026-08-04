const primaryNavigation = ["總覽", "功能總覽", "社員名冊", "活動", "留言板", "會員中心"];
const mobileNavigation = ["總覽", "功能", "名冊", "活動", "留言板", "我的"];

function LoadingPageContent() {
  return (
    <div className="page-stack loading-page" aria-hidden="true">
      <header className="page-header">
        <div className="loading-heading">
          <span className="skeleton skeleton-eyebrow" />
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-copy" />
        </div>
        <span className="skeleton skeleton-action" />
      </header>
      <div className="skeleton-card">
        <span className="skeleton skeleton-card-title" />
        <span className="skeleton skeleton-copy skeleton-copy-wide" />
        <span className="skeleton skeleton-copy" />
      </div>
      <div className="metric-grid">
        <div className="skeleton-card skeleton-metric" />
        <div className="skeleton-card skeleton-metric" />
      </div>
    </div>
  );
}

export function PageLoading() {
  return (
    <section aria-busy="true" aria-live="polite">
      <span className="sr-only">正在載入頁面內容</span>
      <LoadingPageContent />
    </section>
  );
}

export function AppShellLoading() {
  return (
    <div className="shell loading-shell" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在確認登入狀態並載入工作台</span>
      <aside className="sidebar" aria-hidden="true">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span>扶輪管理平台<small>ROTARY V2</small></span>
        </div>
        <nav>
          {primaryNavigation.map((label) => <span className="loading-nav-item" key={label}>{label}</span>)}
        </nav>
        <div className="account loading-account">
          <span className="skeleton skeleton-avatar" />
          <span className="loading-account-copy">
            <span className="skeleton skeleton-account-name" />
            <span className="skeleton skeleton-account-email" />
          </span>
        </div>
      </aside>
      <main id="main" className="content">
        <LoadingPageContent />
      </main>
      <nav className="mobile-nav" aria-hidden="true">
        {mobileNavigation.map((label) => <span className="loading-nav-item" key={label}>{label}</span>)}
      </nav>
    </div>
  );
}
