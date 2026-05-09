/** Componentes de estado: Loading skeleton e Error feedback */

/** Skeleton para listas */
export function SkeletonList({ rows = 6 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 34, borderRadius: 8, opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  )
}

/** Skeleton para chart */
export function SkeletonChart() {
  return (
    <div className="skeleton" style={{ height: 420, borderRadius: 12 }} />
  )
}

/** Mensagem de erro */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="alert alert-error fade-in" style={{ flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>⚠️</span>
        <strong>Erro</strong>
      </div>
      <span style={{ fontSize: 13, opacity: 0.9 }}>{message}</span>
      {onRetry && (
        <button className="btn btn-sm btn-secondary" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}

/** Estado vazio */
export function EmptyState({ icon = '📊', title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: '60px 20px',
      color: 'var(--text-muted)', textAlign: 'center',
    }}>
      <span style={{ fontSize: 48 }}>{icon}</span>
      <strong style={{ color: 'var(--text-secondary)', fontSize: 15 }}>{title}</strong>
      {subtitle && <span style={{ fontSize: 13 }}>{subtitle}</span>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
