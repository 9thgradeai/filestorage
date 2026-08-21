export default function SettingsLoading() {
  return (
    <div className="settings-wrap">
      <div className="settings-card">
        <div className="skeleton" style={{ height: 14, width: 130, marginBottom: '1.5rem' }} />
        <div className="skeleton" style={{ height: 34, width: 180, marginBottom: 2 }} />
        <div className="skeleton" style={{ height: 12, width: 160, marginBottom: '2rem' }} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ marginBottom: '1.5rem' }}>
            <div className="skeleton" style={{ height: 18, width: 150, marginBottom: '1rem' }} />
            <div className="skeleton" style={{ height: 40, width: '100%', marginBottom: '0.75rem' }} />
            <div className="skeleton" style={{ height: 40, width: '100%', marginBottom: '1rem' }} />
            <div className="skeleton" style={{ height: 38, width: 140 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
