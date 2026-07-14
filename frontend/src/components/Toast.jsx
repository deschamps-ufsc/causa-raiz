export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: toast.type === 'success' ? '4px solid #10b981' : '4px solid #ef4444',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        maxWidth: '380px',
        animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: '20px', lineHeight: '1' }}>
          {toast.type === 'success' ? '✅' : '❌'}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {toast.title && (
            <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
              {toast.title}
            </span>
          )}
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-line', lineHeight: '1.4' }}>
            {toast.message}
          </p>
        </div>
        <button 
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: '1',
            marginTop: '-2px'
          }}
        >
          ×
        </button>
      </div>
    </>
  );
}
