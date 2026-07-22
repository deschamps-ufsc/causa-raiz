import { useState, useMemo } from 'react'
import { useChartSettings } from '../hooks/ChartSettingsContext'

const MAX_SELECTION = 20

export function formatSeriesName(name) {
  if (!name) return name;
  const nameLower = name.toLowerCase();
  
  if (nameLower.endsWith('_semtr')) {
    const base = nameLower.replace('_semtr', '');
    const formattedBase = formatSeriesName(base);
    return `${formattedBase} (Sem TR)`;
  }

  if (nameLower === 'gpoa') return 'Gpoa';
  if (nameLower === 'grear') return 'Grear';
  if (nameLower === 'geff') return 'Geff';
  if (nameLower === 'tamb') return 'Tamb';
  if (nameLower === 'tmod') return 'Tmod';
  if (nameLower === 'tcel') return 'Tcel';
  if (nameLower === 'sujidade') return 'Sujidade';
  if (nameLower === 'potencia_ppc') return 'Potência PPC';
  if (nameLower === 'referencia_ppc') return 'Referência PPC';
  if (nameLower === 'simultaneidade') return 'Simultaneidade';
  if (nameLower === 'curtailment') return 'Curtailment';
  
  return name;
}

export function getSerieType(s) {
  if (s.sintetica) return 'Sintético';
  const col = s.coluna.toLowerCase();
  const flowOps = ['gpoa', 'grear', 'geff', 'tamb', 'tmod', 'tcel', 'sujidade', 'tracker', 'potencia_ppc', 'referencia_ppc', 'energia_pmi', 'energia pmi', 'simultaneidade'];
  if (col.startsWith('agg_') || flowOps.includes(col) || col.endsWith('_semtr') || col.endsWith('_válida') || col.endsWith('_valida') || col === 'tracker ref.' || col === 'tracker_is_backtracking' || col.startsWith('flag_tracker_erro')) {
    return 'Processado';
  }
  return 'Original';
}

/**
 * Painel de seleção de séries com busca e filtros em cascata.
 * Elemento → Estação → SKID → Inversor → Stringbox → String
 */
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

export default function SeriesSelector({ series, selected, onChange, elementos, isKanban = false }) {
  const { getSettingForElement, elementSettings } = useChartSettings() || {};
  const [search, setSearch] = useState('')
  const [filterEl, setFilterEl] = useState('')
  const [filterEstacao, setFilterEstacao] = useState('')
  const [filterSkid, setFilterSkid] = useState('')
  const [filterInv, setFilterInv] = useState('')
  const [filterSb, setFilterSb] = useState('')
  const [filterTracker, setFilterTracker] = useState('')
  const [filterStr, setFilterStr] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const hasActiveFilters = filterTipo || filterEl || filterEstacao || filterSkid || filterInv || filterSb || filterTracker || filterStr

  // Filtros em cascata
  const filteredSeries = useMemo(() => {
    return series.filter((s) => {
      if (filterTipo && getSerieType(s) !== filterTipo) return false
      if (!isKanban && filterEl && s.elemento !== filterEl) return false
      if (filterEstacao && s.estacao !== filterEstacao) return false
      if (filterSkid && s.skid !== filterSkid) return false
      if (filterInv && s.inversor !== filterInv) return false
      if (filterSb && s.stringbox !== filterSb) return false
      if (filterTracker && s.tracker !== filterTracker) return false
      if (filterStr) {
        if (!s.string) return false
        const strList = s.string.split(';').map(x => x.trim())
        if (!strList.includes(filterStr)) return false
      }
      if (search && !s.coluna.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }).sort((a, b) => naturalSort(a.coluna, b.coluna))
  }, [series, filterTipo, filterEl, filterEstacao, filterSkid, filterInv, filterSb, filterTracker, filterStr, search])

  const uniqueEstacoes = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterEl || s.elemento === filterEl)
        .map((s) => s.estacao)
        .filter(Boolean)
    )].sort(naturalSort)
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
    )].sort(naturalSort)
  , [series, filterEl, filterEstacao])

  const uniqueInvs = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterSkid || s.skid === filterSkid)
        .map((s) => s.inversor)
        .filter(Boolean)
    )].sort(naturalSort)
  , [series, filterSkid])

  const uniqueSbs = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterInv || s.inversor === filterInv)
        .map((s) => s.stringbox)
        .filter(Boolean)
    )].sort(naturalSort)
  , [series, filterInv])

  const uniqueTrackers = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterSb || s.stringbox === filterSb)
        .map((s) => s.tracker)
        .filter(Boolean)
    )].sort(naturalSort)
  , [series, filterSb])

  const uniqueStrings = useMemo(() =>
    [...new Set(
      series
        .filter((s) => !filterSb || s.stringbox === filterSb)
        .filter((s) => !filterTracker || s.tracker === filterTracker)
        .flatMap((s) => s.string ? s.string.split(';').map(x => x.trim()) : [])
        .filter(Boolean)
    )].sort(naturalSort)
  , [series, filterSb, filterTracker])

  const seriesByElement = useMemo(() => {
    if (!isKanban) return {};
    const groups = {};
    filteredSeries.forEach(s => {
      let el = s.elemento;
      if (el) {
        const isRegistered = el.toLowerCase() === 'pvsyst' || elementSettings?.some(es => es.element.toLowerCase() === el.toLowerCase());
        if (!isRegistered) {
          el = 'Outros';
        }
      } else {
        el = s.mapeada ? 'Outros' : 'Séries Não Mapeadas';
      }
      
      if (!groups[el]) groups[el] = [];
      groups[el].push(s);
    });
    return groups;
  }, [filteredSeries, isKanban]);

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
    setFilterTipo('')
    setFilterEl('')
    setFilterEstacao('')
    setFilterSkid('')
    setFilterInv('')
    setFilterSb('')
    setFilterTracker('')
    setFilterStr('')
  }

  const filterInputs = (
    <>
      <select className="input" style={{ fontSize: 12, flexShrink: 0, width: isKanban ? 'auto' : '100%' }} value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setFilterEl(''); setFilterEstacao(''); setFilterSkid(''); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
        <option value="">Todos os Tipos</option>
        <option value="Original">Original</option>
        <option value="Sintético">Sintético</option>
        <option value="Processado">Processado</option>
      </select>
      {!isKanban && (
        <select className="input" style={{ fontSize: 12, flexShrink: 0, width: '100%' }} value={filterEl} onChange={(e) => { setFilterEl(e.target.value); setFilterEstacao(''); setFilterSkid(''); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
          <option value="">Todos os Elementos</option>
          {elementos.map((el) => <option key={el} value={el}>{el}</option>)}
        </select>
      )}
      {uniqueEstacoes.length > 0 && (
        <select className="input" style={{ fontSize: 12, flexShrink: 0, width: isKanban ? 'auto' : '100%' }} value={filterEstacao} onChange={(e) => { setFilterEstacao(e.target.value); setFilterSkid(''); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
          <option value="">Todas as Estações</option>
          {uniqueEstacoes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {uniqueSkids.length > 0 && (
        <select className="input" style={{ fontSize: 12, flexShrink: 0, width: isKanban ? 'auto' : '100%' }} value={filterSkid} onChange={(e) => { setFilterSkid(e.target.value); setFilterInv(''); setFilterSb(''); setFilterStr(''); }}>
          <option value="">Todos os SKIDs</option>
          {uniqueSkids.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {uniqueInvs.length > 0 && (
        <select className="input" style={{ fontSize: 12, flexShrink: 0, width: isKanban ? 'auto' : '100%' }} value={filterInv} onChange={(e) => { setFilterInv(e.target.value); setFilterSb(''); setFilterStr(''); }}>
          <option value="">Todos os Inversores</option>
          {uniqueInvs.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {uniqueSbs.length > 0 && (
        <select className="input" style={{ fontSize: 12, flexShrink: 0, width: isKanban ? 'auto' : '100%' }} value={filterSb} onChange={(e) => { setFilterSb(e.target.value); setFilterTracker(''); setFilterStr(''); }}>
          <option value="">Todos os Stringboxes</option>
          {uniqueSbs.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {uniqueTrackers.length > 0 && (
        <select className="input" style={{ fontSize: 12, flexShrink: 0, width: isKanban ? 'auto' : '100%' }} value={filterTracker} onChange={(e) => { setFilterTracker(e.target.value); setFilterStr(''); }}>
          <option value="">Todos os Trackers</option>
          {uniqueTrackers.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {uniqueStrings.length > 0 && (
        <select className="input" style={{ fontSize: 12, flexShrink: 0, width: isKanban ? 'auto' : '100%' }} value={filterStr} onChange={(e) => setFilterStr(e.target.value)}>
          <option value="">Todas as Strings</option>
          {uniqueStrings.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      {/* Barra de busca e Filtros */}
      <div style={{ position: 'relative' }}>
        {isKanban ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 120 }}>
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
          {filterInputs}
          {hasActiveFilters && (
            <button onClick={clearFilters} style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--red)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '6px 12px', whiteSpace: 'nowrap' }}>Limpar Filtros</button>
          )}
        </div>
      ) : (
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
        </div>
      )}

      {/* Popover de Filtros (only if !isKanban) */}
        {!isKanban && isFilterOpen && (
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

              {filterInputs}

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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {filteredSeries.length} {filteredSeries.length === 1 ? 'série' : 'séries'} {hasActiveFilters ? 'filtradas' : 'visíveis'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>
            {selected.length}/{MAX_SELECTION} selecionadas
          </span>
          {selected.length >= MAX_SELECTION && (
            <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>LIMITE ATINGIDO</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={selectAll}>Sel. todos</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={clearAll}>Limpar</button>
        </div>
      </div>

      {/* Lista de séries */}
      {isKanban ? (
        <div style={{ flex: 1, display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden', minHeight: 0, paddingBottom: 8 }}>
          {Object.entries(seriesByElement).sort((a,b) => {
            if (!elementSettings) return a[0].localeCompare(b[0]);
            const idxA = elementSettings.findIndex(s => s.element.toLowerCase() === a[0].toLowerCase());
            const idxB = elementSettings.findIndex(s => s.element.toLowerCase() === b[0].toLowerCase());
            const posA = idxA >= 0 ? idxA : 9999;
            const posB = idxB >= 0 ? idxB : 9999;
            if (posA !== posB) return posA - posB;
            return a[0].localeCompare(b[0]);
          }).map(([el, items]) => {
            const setting = getSettingForElement ? getSettingForElement(el) : null;
            const baseHex = setting?.colors?.[0] || setting?.color || '#cbd5e1'; // slate-300 default

            const hexToRgba = (hex, alpha) => {
              let c;
              if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
                c= hex.substring(1).split('');
                if(c.length === 3){
                  c= [c[0], c[0], c[1], c[1], c[2], c[2]];
                }
                c= '0x'+c.join('');
                return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
              }
              return `rgba(203, 213, 225, ${alpha})`;
            };

            const headerBg = hexToRgba(baseHex, 0.15);
            const bodyBg = hexToRgba(baseHex, 0.04);
            const borderColor = hexToRgba(baseHex, 0.25);

            return (
              <div key={el} style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: bodyBg, border: `1px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: headerBg, borderBottom: `1px solid ${borderColor}`, fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
                  <span>{el}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{items.length}</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {items.slice(0, 100).map(s => {
                  const isSelected = selected.includes(s.coluna)
                  const isDisabled = !isSelected && selected.length >= MAX_SELECTION
                  return (
                    <label
                      key={s.coluna}
                      className="checkbox-row"
                      style={{ 
                        opacity: isDisabled ? 0.4 : (s.hasData === false ? 0.5 : 1), cursor: isDisabled ? 'not-allowed' : 'pointer',
                        background: isSelected ? 'rgba(245,158,11,0.05)' : 'transparent',
                        border: isSelected ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                        borderRadius: 6, padding: '5px 6px', margin: '2px 0', display: 'flex', alignItems: 'flex-start', gap: '6px'
                      }}
                    >
                      <input type="checkbox" checked={isSelected} disabled={isDisabled} onChange={() => toggle(s.coluna)} style={{ marginTop: '2px' }} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 12, lineHeight: 1.3, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--amber)' : (s.hasData === false ? 'var(--text-muted)' : 'var(--text-primary)'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: s.hasData === false ? 'line-through' : 'none' }}>
                          {formatSeriesName(s.coluna)}
                        </div>
                        {(s.mapeada || s.elemento) && (
                          <div style={{ fontSize: 10, lineHeight: 1.2, color: 'var(--text-muted)', display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: 2 }}>
                            {s.estacao && <span style={{ color: '#14b8a6', flexShrink: 0 }}>📍 {s.estacao}</span>}
                            {s.skid && <span style={{ flexShrink: 0 }}>{s.skid}</span>}
                            {s.inversor && <span style={{ flexShrink: 0 }}>· {s.inversor}</span>}
                            {s.stringbox && <span style={{ flexShrink: 0 }}>· {s.stringbox}</span>}
                            {s.tracker && <span style={{ flexShrink: 0, color: '#a78bfa' }}>· {s.tracker}</span>}
                            {s.string && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· {s.string}</span>}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
                {items.length > 100 && (
                  <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                    + {items.length - 100} séries
                  </div>
                )}
              </div>
            </div>
          )})}
        </div>
      ) : (
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, paddingRight: 4
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
                      opacity: isDisabled ? 0.4 : (s.hasData === false ? 0.5 : 1), cursor: isDisabled ? 'not-allowed' : 'pointer',
                      background: isSelected ? 'rgba(245,158,11,0.05)' : 'transparent',
                      border: isSelected ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                      borderRadius: 6, padding: '5px 6px', margin: '2px 0', display: 'flex', alignItems: 'flex-start', gap: '6px'
                    }}
                  >
                    <input type="checkbox" checked={isSelected} disabled={isDisabled} onChange={() => toggle(s.coluna)} style={{ marginTop: '2px' }} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: 12, lineHeight: 1.3, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--amber)' : (s.hasData === false ? 'var(--text-muted)' : 'var(--text-primary)'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: s.hasData === false ? 'line-through' : 'none' }}>
                        {formatSeriesName(s.coluna)}
                      </div>
                      {(s.mapeada || s.elemento) && (
                        <div style={{ fontSize: 10, lineHeight: 1.2, color: 'var(--text-muted)', display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {s.elemento && <span style={{ color: 'var(--amber)', flexShrink: 0, fontWeight: 600 }}>{s.elemento}</span>}
                          {s.estacao && <span style={{ color: '#14b8a6', flexShrink: 0 }}>📍 {s.estacao}</span>}
                          {s.skid && <span style={{ flexShrink: 0 }}>{s.skid}</span>}
                          {s.inversor && <span style={{ flexShrink: 0 }}>· {s.inversor}</span>}
                          {s.stringbox && <span style={{ flexShrink: 0 }}>· {s.stringbox}</span>}
                          {s.tracker && <span style={{ flexShrink: 0, color: '#a78bfa' }}>· {s.tracker}</span>}
                          {s.string && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· {s.string}</span>}
                        </div>
                      )}
                    </div>
                  </label>
                )
              })}
              {filteredSeries.length > 100 && (
                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--amber)', fontSize: 11, background: 'rgba(245,158,11,0.1)', borderRadius: 6, marginTop: 8 }}>
                  Mostrando 100 de {filteredSeries.length} séries.<br/>
                  Refine a busca ou use os filtros.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
