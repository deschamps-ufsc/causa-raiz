import React, { useState, useMemo, useRef, useEffect } from 'react'

const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

export function getSerieType(s) {
  if (s.sintetica) return 'Sintético';
  const col = s.coluna.toLowerCase();
  const flowOps = ['gpoa', 'grear', 'geff', 'tamb', 'tmod', 'tcel', 'sujidade', 'tracker', 'energia', 'energia_pmi', 'simultaneidade'];
  if (col.startsWith('agg_') || flowOps.includes(col) || col === 'tracker ref.' || col === 'tracker_is_backtracking' || col.startsWith('flag_tracker_erro')) {
    return 'Processado';
  }
  return 'Original';
}

export function formatSeriesName(name) {
  if (!name) return name;
  const nameLower = name.toLowerCase();
  if (nameLower === 'gpoa') return 'Gpoa';
  if (nameLower === 'grear') return 'Grear';
  if (nameLower === 'geff') return 'Geff';
  if (nameLower === 'tamb') return 'Tamb';
  if (nameLower === 'tmod') return 'Tmod';
  if (nameLower === 'tcel') return 'Tcel';
  if (nameLower === 'sujidade') return 'Sujidade';
  if (nameLower === 'energia') return 'Potência PPC';
  if (nameLower === 'simultaneidade') return 'Simultaneidade';
  if (nameLower === 'curtailment') return 'Curtailment';
  return name;
}

export default function SingleSeriesDropdown({ value, onChange, series = [], elementos = [], fixedElement = null }) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Filtros
  const [search, setSearch] = useState('')
  const [filterElState, setFilterElState] = useState('')
  const filterEl = fixedElement || filterElState;
  const [filterEstacao, setFilterEstacao] = useState('')
  const [filterSkid, setFilterSkid] = useState('')
  const [filterInv, setFilterInv] = useState('')
  const [filterSb, setFilterSb] = useState('')
  const [filterStr, setFilterStr] = useState('')
  const [filterTipo, setFilterTipo] = useState('')

  const containerRef = useRef(null)
  const [dropUp, setDropUp] = useState(false)

  // Mede o espaço vertical disponível na tela ao abrir para decidir se joga para cima (Drop-up)
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      
      // Se o espaço abaixo for menor que 360px (maxHeight 350px + 10px margem)
      // e o espaço acima for maior que o de baixo, abre para cima
      if (spaceBelow < 360 && spaceAbove > spaceBelow) {
        setDropUp(true)
      } else {
        setDropUp(false)
      }
    }
  }, [isOpen])

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const hasActiveFilters = filterTipo || filterEl || filterEstacao || filterSkid || filterInv || filterSb || filterStr

  const filteredSeries = useMemo(() => {
    return series.filter((s) => {
      if (filterTipo && getSerieType(s) !== filterTipo) return false
      if (filterEl && s.elemento !== filterEl) return false
      if (filterEstacao && s.estacao !== filterEstacao) return false
      if (filterSkid && s.skid !== filterSkid) return false
      if (filterInv && s.inversor !== filterInv) return false
      if (filterSb && s.stringbox !== filterSb) return false
      if (filterStr && s.string !== filterStr) return false
      if (search && !s.coluna.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [series, filterTipo, filterEl, filterEstacao, filterSkid, filterInv, filterSb, filterStr, search])

  const uniqueEstacoes = useMemo(() => [...new Set(series.filter(s => !filterEl || s.elemento === filterEl).map(s => s.estacao).filter(Boolean))].sort(naturalSort), [series, filterEl])
  const uniqueSkids = useMemo(() => [...new Set(series.filter(s => (!filterEl || s.elemento === filterEl) && (!filterEstacao || s.estacao === filterEstacao)).map(s => s.skid).filter(Boolean))].sort(naturalSort), [series, filterEl, filterEstacao])
  const uniqueInvs = useMemo(() => [...new Set(series.filter(s => !filterSkid || s.skid === filterSkid).map(s => s.inversor).filter(Boolean))].sort(naturalSort), [series, filterSkid])
  const uniqueSbs = useMemo(() => [...new Set(series.filter(s => !filterInv || s.inversor === filterInv).map(s => s.stringbox).filter(Boolean))].sort(naturalSort), [series, filterInv])
  const uniqueStrings = useMemo(() => [...new Set(series.filter(s => !filterSb || s.stringbox === filterSb).map(s => s.string).filter(Boolean))].sort(naturalSort), [series, filterSb])

  const handleSelect = (coluna) => {
    onChange(coluna)
    setIsOpen(false)
  }

  const clearFilters = () => {
    setFilterTipo('')
    setFilterElState('')
    setFilterEstacao('')
    setFilterSkid('')
    setFilterInv('')
    setFilterSb('')
    setFilterStr('')
  }

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const filterButtonRef = useRef(null)
  const [filtersDropUp, setFiltersDropUp] = useState(false)

  // Mede o espaço vertical disponível especificamente para o popover de filtros hierárquicos ao ser aberto
  useEffect(() => {
    if (isFilterOpen && filterButtonRef.current) {
      const rect = filterButtonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      
      // O popover de filtros tem ~300px de altura. Se faltar espaço abaixo e houver mais espaço acima, abre para cima
      if (spaceBelow < 320 && spaceAbove > spaceBelow) {
        setFiltersDropUp(true)
      } else {
        setFiltersDropUp(false)
      }
    }
  }, [isFilterOpen])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Botão que simula o Select */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: '1px solid var(--border)', background: 'var(--bg-input)', padding: '8px 12px',
          borderRadius: '6px', fontSize: '13px', color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: 'pointer', userSelect: 'none'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? formatSeriesName(value) : 'Selecionar série...'}
        </span>
        <span style={{ fontSize: '10px' }}>▼</span>
      </div>

      {/* Popover */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: dropUp ? 'auto' : 'calc(100% + 4px)',
          bottom: dropUp ? 'calc(100% + 4px)' : 'auto',
          left: 0, right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', zIndex: 1050, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column', maxHeight: '350px'
        }}>
          
          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '6px', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  className="input"
                  style={{ width: '100%', fontSize: '13px', paddingRight: '24px' }}
                  placeholder="🔍 Buscar série..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
                  >×</button>
                )}
              </div>

              <button 
                ref={filterButtonRef}
                className={`btn ${hasActiveFilters ? 'btn-primary' : 'btn-ghost'}`} 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                title="Filtros avançados (Elementos, Estações, etc)"
                style={{ 
                  padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isFilterOpen ? 'var(--amber)' : (hasActiveFilters ? 'rgba(245,158,11,0.2)' : 'none'),
                  borderColor: hasActiveFilters ? 'var(--amber)' : 'var(--border)',
                  color: isFilterOpen ? '#000' : (hasActiveFilters ? 'var(--amber)' : 'var(--text-secondary)'),
                  height: '32px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {hasActiveFilters && !isFilterOpen && (
                  <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '1.5px solid var(--bg-sidebar)' }} />
                )}
              </button>

              {/* Filtros Hierárquicos Popover */}
              {isFilterOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setIsFilterOpen(false)} />
                  <div style={{
                    position: 'absolute',
                    top: filtersDropUp ? 'auto' : 'calc(100% + 8px)',
                    bottom: filtersDropUp ? 'calc(100% + 8px)' : 'auto',
                    right: 0, width: 260, zIndex: 101,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column', gap: 10
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Filtros Hierárquicos</span>
                      {hasActiveFilters && (
                        <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: 0 }}>LIMPAR</button>
                      )}
                    </div>

                    <select className="input" style={{ fontSize: 12 }} value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setFilterElState(''); setFilterEstacao(''); setFilterSkid(''); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
                      <option value="">Todos os Tipos</option>
                      <option value="Original">Original</option>
                      <option value="Sintético">Sintético</option>
                      <option value="Processado">Processado</option>
                    </select>

                    {!fixedElement && (
                      <select className="input" style={{ fontSize: 12 }} value={filterElState} onChange={e => { setFilterElState(e.target.value); setFilterEstacao(''); setFilterSkid(''); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
                        <option value="">Todos os Elementos</option>
                        {elementos.map(el => <option key={el} value={el}>{el}</option>)}
                      </select>
                    )}

                    <select className="input" style={{ fontSize: 12 }} value={filterEstacao} onChange={e => { setFilterEstacao(e.target.value); setFilterSkid(''); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
                      <option value="">Todas as Estações</option>
                      {uniqueEstacoes.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select className="input" style={{ fontSize: 12 }} value={filterSkid} onChange={e => { setFilterSkid(e.target.value); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
                      <option value="">Todos os SKIDs</option>
                      {uniqueSkids.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select className="input" style={{ fontSize: 12 }} value={filterInv} onChange={e => { setFilterInv(e.target.value); setFilterSb(''); setFilterStr(''); }}>
                      <option value="">Todos os Inversores</option>
                      {uniqueInvs.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select className="input" style={{ fontSize: 12 }} value={filterSb} onChange={e => { setFilterSb(e.target.value); setFilterStr(''); }}>
                      <option value="">Todos os Stringboxes</option>
                      {uniqueSbs.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select className="input" style={{ fontSize: 12 }} value={filterStr} onChange={e => setFilterStr(e.target.value)}>
                      <option value="">Todas as Strings</option>
                      {uniqueStrings.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

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
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column' }}>
            {filteredSeries.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                Nenhuma série encontrada. (Filtros: {hasActiveFilters ? 'Sim' : 'Não'}, Total séries: {series.length})
              </div>
            ) : (
              filteredSeries.slice(0, 100).map((s) => (
                <div
                  key={s.coluna}
                  onClick={() => handleSelect(s.coluna)}
                  style={{
                    padding: '8px 10px', fontSize: '12px', color: 'var(--text-primary)',
                    cursor: 'pointer', borderRadius: '4px', flexShrink: 0,
                    background: value === s.coluna ? 'rgba(245,158,11,0.1)' : 'transparent',
                    border: value === s.coluna ? '1px solid var(--amber)' : '1px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                  onMouseEnter={e => { if (value !== s.coluna) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (value !== s.coluna) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatSeriesName(s.coluna)}
                  </span>
                  {s.elemento && (
                    <span style={{ 
                      fontSize: '10px', background: 'var(--bg-secondary)', padding: '2px 6px', 
                      borderRadius: '12px', color: 'var(--text-secondary)', fontWeight: 600,
                      border: '1px solid var(--border)', flexShrink: 0, marginLeft: 8
                    }}>
                      {s.elemento}
                    </span>
                  )}
                </div>
              ))
            )}
            {filteredSeries.length > 100 && (
              <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                Mostrando 100 de {filteredSeries.length} séries. Refine a busca.
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
