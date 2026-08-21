export default function DashboardLoading() {
  return (
    <div className="drive-loading">
      <div className="drive-loading-sidebar">
        <div className="skeleton skeleton-brand" />
        <div className="skeleton skeleton-nav" />
        <div className="skeleton skeleton-nav" />
        <div className="skeleton skeleton-nav" />
        <div className="skeleton skeleton-nav" />
      </div>
      <div className="drive-loading-main">
        <div className="skeleton skeleton-toolbar" />
        <div className="skeleton-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
