import { useState, useMemo } from 'react'

const MAX_SELECTION = 20

/**
 * Painel de seleção de séries com busca e filtros em cascata.
 * Elemento → Estação → SKID → Inversor → Stringbox
 */
export default function SeriesSelector({ series, selected, onChange, elementos }) {
  const [search, setSearch] = useState('')
  const [filterEl, setFilterEl] = useState('')
  const [filterEstacao, setFilterEstacao] = useState('')
  const [filterSkid, setFilterSkid] = useState('')
  const [filterInv, setFilterInv] = useState('')
  const [filterSb, setFilterSb] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const hasActiveFilters = filterEl || filterEstacao || filterSkid || filterInv || filterSb

  // Filtros em cascata
  const filteredSeries = useMemo(() => {
    return series.filter((s) => {
      if (filterEl && s.elemento !== filterEl) return false
      if (filterEstacao && s.estacao !== filterEstacao) return false
      if (filterSkid && s.skid !== filterSkid) return false
      if (filterInv && s.inversor !== filterInv) return false
      if (filterSb && s.stringbox !== filterSb) return false
      if (search && !s.coluna.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [series, filterEl, filterEstacao, filterSkid, filterInv, filterSb, search])

  const uniqueEstacoes = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterEl || s.elemento === filterEl)
        .map((s) => s.estacao)
        .filter(Boolean)
    )].sort()
  , [series, filterEl])

  const uniqueSkids = useMemo(() =>
    [...new Set(
      series
        .filter((s) => {
          if (filterEl && s.elemento !== filterEl) return false
          if (filterEstacao && s.estacao !== filterEstacao) return false
          return true
        })
        .map((s) => s.skid)
        .filter(Boolean)
    )].sort()
  , [series, filterEl, filterEstacao])

  const uniqueInvs = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterSkid || s.skid === filterSkid)
        .map((s) => s.inversor)
        .filter(Boolean)
    )].sort()
  , [series, filterSkid])

  const uniqueSbs = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterInv || s.inversor === filterInv)
        .map((s) => s.stringbox)
        .filter(Boolean)
    )].sort()
  , [series, filterInv])

  const toggle = (col) => {
    if (selected.includes(col)) {
      onChange(selected.filter((c) => c !== col))
    } else {
      if (selected.length >= MAX_SELECTION) return
      onChange([...selected, col])
    }
  }

  const selectAll = () => {
    const toAdd = filteredSeries.slice(0, MAX_SELECTION).map((s) => s.coluna)
    onChange([...new Set([...selected, ...toAdd])].slice(0, MAX_SELECTION))
  }

  const clearAll = () => onChange([])

  const clearFilters = () => {
    setFilterEl('')
    setFilterEstacao('')
    setFilterSkid('')
    setFilterInv('')
    setFilterSb('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      {/* Barra de busca e Filtros */}
      <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            className="input"
            style={{ width: '100%', paddingRight: 30 }}
            placeholder="🔍 Buscar série..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
            >×</button>
          )}
        </div>

        <button 
          className={`btn ${hasActiveFilters ? 'btn-primary' : 'btn-ghost'}`} 
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          title="Filtros avançados (Elementos, Estações, etc)"
          style={{ 
            padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isFilterOpen ? 'var(--amber)' : (hasActiveFilters ? 'rgba(245,158,11,0.2)' : 'none'),
            borderColor: hasActiveFilters ? 'var(--amber)' : 'var(--border)',
            color: isFilterOpen ? '#000' : (hasActiveFilters ? 'var(--amber)' : 'var(--text-secondary)')
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {hasActiveFilters && !isFilterOpen && (
            <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '1.5px solid var(--bg-sidebar)' }} />
          )}
        </button>

        {/* Popover de Filtros */}
        {isFilterOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setIsFilterOpen(false)} />
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 260, zIndex: 101,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
              display: 'flex', flexDirection: 'column', gap: 10,
              animation: 'fadeIn 0.15s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Filtros Hierárquicos</span>
                {hasActiveFilters && (
                  <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: 0 }}>LIMPAR</button>
                )}
              </div>

              {/* Filtro: Elemento */}
              <select
                className="input"
                style={{ fontSize: 12 }}
                value={filterEl}
                onChange={(e) => {
                  setFilterEl(e.target.value)
                  setFilterEstacao('')
                  setFilterSkid('')
                  setFilterInv('')
                  setFilterSb('')
                }}
              >
                <option value="">Todos os Elementos</option>
                {elementos.map((el) => <option key={el} value={el}>{el}</option>)}
              </select>

              {/* Filtro: Estação */}
              {uniqueEstacoes.length > 0 && (
                <select
                  className="input"
                  style={{ fontSize: 12 }}
                  value={filterEstacao}
                  onChange={(e) => {
                    setFilterEstacao(e.target.value)
                    setFilterSkid('')
                    setFilterInv('')
                    setFilterSb('')
                  }}
                >
                  <option value="">Todas as Estações</option>
                  {uniqueEstacoes.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}

              {/* Filtro: SKID */}
              {uniqueSkids.length > 0 && (
                <select
                  className="input"
                  style={{ fontSize: 12 }}
                  value={filterSkid}
                  onChange={(e) => {
                    setFilterSkid(e.target.value)
                    setFilterInv('')
                    setFilterSb('')
                  }}
                >
                  <option value="">Todos os SKIDs</option>
                  {uniqueSkids.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}

              {/* Filtro: Inversor */}
              {uniqueInvs.length > 0 && (
                <select
                  className="input"
                  style={{ fontSize: 12 }}
                  value={filterInv}
                  onChange={(e) => {
                    setFilterInv(e.target.value)
                    setFilterSb('')
                  }}
                >
                  <option value="">Todos os Inversores</option>
                  {uniqueInvs.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}

              {/* Filtro: Stringbox */}
              {uniqueSbs.length > 0 && (
                <select
                  className="input"
                  style={{ fontSize: 12 }}
                  value={filterSb}
                  onChange={(e) => setFilterSb(e.target.value)}
                >
                  <option value="">Todos os Stringboxes</option>
                  {uniqueSbs.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}

              <button 
                className="btn btn-primary btn-sm" 
                style={{ marginTop: 6, background: 'var(--amber)', color: '#000' }}
                onClick={() => setIsFilterOpen(false)}
              >
                Aplicar Filtros
              </button>
            </div>
          </>
        )}
      </div>

      {/* Contador e ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {filteredSeries.length} {filteredSeries.length === 1 ? 'série' : 'séries'} {hasActiveFilters ? 'filtradas' : 'visíveis'}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={selectAll}>Sel. todos</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={clearAll}>Limpar</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>
          {selected.length}/{MAX_SELECTION} selecionadas
        </span>
        {selected.length >= MAX_SELECTION && (
          <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>LIMITE ATINGIDO</span>
        )}
      </div>

      {/* Lista de séries */}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 2,
        minHeight: 0,
        paddingRight: 4
      }}>
        {filteredSeries.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
            Nenhuma série encontrada<br/>
            {hasActiveFilters && <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', textDecoration: 'underline', marginTop: 8, fontSize: 12 }}>Limpar filtros</button>}
          </div>
        ) : (
          <>
            {filteredSeries.slice(0, 100).map((s) => {
              const isSelected = selected.includes(s.coluna)
              const isDisabled = !isSelected && selected.length >= MAX_SELECTION
              return (
                <label
                  key={s.coluna}
                  className="checkbox-row"
                  style={{ 
                    opacity: isDisabled ? 0.4 : 1, 
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    background: isSelected ? 'rgba(245,158,11,0.05)' : 'transparent',
                    border: isSelected ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                    borderRadius: 6,
                    padding: '6px 8px',
                    margin: '1px 0'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => toggle(s.coluna)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--amber)' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.coluna}
                    </div>
                    {s.mapeada && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {s.elemento && <span style={{ color: 'var(--amber)', flexShrink: 0, fontWeight: 600 }}>{s.elemento}</span>}
                        {s.estacao && <span style={{ color: '#14b8a6', flexShrink: 0 }}>📍 {s.estacao}</span>}
                        {s.skid && <span style={{ flexShrink: 0 }}>{s.skid}</span>}
                        {s.inversor && <span style={{ flexShrink: 0 }}>· {s.inversor}</span>}
                        {s.stringbox && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· {s.stringbox}</span>}
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
            {filteredSeries.length > 100 && (
              <div style={{
                padding: '12px', textAlign: 'center', color: 'var(--amber)',
                fontSize: 11, background: 'rgba(245,158,11,0.1)', borderRadius: 6,
                marginTop: 8
              }}>
                Mostrando 100 de {filteredSeries.length} séries.<br/>
                Refine a busca ou use os filtros.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
