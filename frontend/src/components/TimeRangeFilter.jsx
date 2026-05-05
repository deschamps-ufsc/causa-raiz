/**
 * Filtro de intervalo de tempo (HH:MM → HH:MM)
 */
export default function TimeRangeFilter({ start, end, onChange, totalPoints }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="input-label" style={{ marginBottom: 0 }}>Início</label>
          <input
            type="time"
            className="input"
            value={start}
            onChange={(e) => onChange({ start: e.target.value, end })}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="input-label" style={{ marginBottom: 0 }}>Fim</label>
          <input
            type="time"
            className="input"
            value={end}
            onChange={(e) => onChange({ start, end: e.target.value })}
          />
        </div>
      </div>

      {/* Resumo e Botão lado a lado, combinando com o estilo do input */}
      <div style={{ display: 'flex', gap: 10 }}>
        {totalPoints !== undefined && (
          <div 
            className="input"
            style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6, 
              padding: '9px 8px', 
              height: 38,
              fontSize: 11,
              cursor: 'default',
              userSelect: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ color: 'var(--amber)', fontSize: 13 }}>⏱</span>
            <span><strong style={{ color: 'var(--text-primary)' }}>{totalPoints.toLocaleString('pt-BR')}</strong> pontos</span>
          </div>
        )}

        {(() => {
          const isFullDay = start === '00:00' && end === '23:59';
          return (
            <button
              className="input"
              style={{ 
                flex: 1, 
                height: 38,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isFullDay ? 'default' : 'pointer',
                fontWeight: 600,
                fontSize: 11,
                whiteSpace: 'nowrap',
                // Estilo "Vivo" vs "Desabilitado"
                background: isFullDay ? 'var(--bg-input)' : 'var(--amber-glow)',
                borderColor: isFullDay ? 'var(--border)' : 'var(--amber)',
                color: isFullDay ? 'var(--text-muted)' : 'var(--amber-dark)',
                opacity: isFullDay ? 0.7 : 1,
                transition: 'all 0.2s'
              }}
              onClick={() => !isFullDay && onChange({ start: '00:00', end: '23:59' })}
            >
              Dia completo
            </button>
          );
        })()}
      </div>
    </div>
  )
}
