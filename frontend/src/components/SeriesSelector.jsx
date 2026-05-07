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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      {/* Barra de busca */}
      <input
        className="input"
        placeholder="🔍 Buscar por nome da série..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Filtro: Elemento */}
      <select
        className="input"
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
          value={filterSb}
          onChange={(e) => setFilterSb(e.target.value)}
        >
          <option value="">Todos os Stringboxes</option>
          {uniqueSbs.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {/* Contador e ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {filteredSeries.length} visíveis
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={selectAll}>Sel. todos</button>
          <button className="btn btn-ghost btn-sm" onClick={clearAll}>Limpar</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--amber)' }}>
          {selected.length}/{MAX_SELECTION} séries selecionadas
        </span>
        {selected.length >= MAX_SELECTION && (
          <span style={{ fontSize: 11, color: 'var(--red)' }}>Limite atingido</span>
        )}
      </div>

      {/* Lista de séries */}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 2,
        minHeight: 0
      }}>
        {filteredSeries.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhuma série encontrada
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
                  style={{ opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => toggle(s.coluna)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.coluna}
                    </div>
                    {s.mapeada && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {s.elemento && <span style={{ color: 'var(--amber)', flexShrink: 0 }}>{s.elemento}</span>}
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
                Mostrando as 100 primeiras séries de {filteredSeries.length}.<br/>
                Use a busca ou os filtros acima para refinar a lista.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
