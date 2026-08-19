export default function BlessingIouManagementLoading() {
  return <div className="page-stack" aria-busy="true" aria-live="polite">
    <span className="sr-only">正在載入祝福 IOU 管理</span>
    <header className="page-header">
      <div>
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-copy skeleton-copy-wide" />
      </div>
    </header>
    <div className="skeleton-card">
      <span className="skeleton skeleton-card-title" />
      <span className="skeleton skeleton-copy skeleton-copy-wide" />
      <span className="skeleton skeleton-copy" />
    </div>
  </div>;
}
