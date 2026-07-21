// Instant skeleton for dashboard-group navigations — paints the chrome and
// placeholder cards while the server renders the data-heavy page.
export default function DashboardLoading() {
  return (
    <>
      <div className="page-header">
        <div>
          <div className="skeleton" style={{ width: 180, height: 28, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: 260, height: 16 }} />
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="skeleton" style={{ height: 280 }} />
        <div className="skeleton" style={{ height: 280 }} />
      </div>
    </>
  );
}
