import { useState, useRef, useEffect } from 'react'
import { EXCEL_THEME } from '../constants/palette'

export default function SharedColorPicker({ color: currentColor, onChange, onClose, children }) {
  const ref = useRef(null)

  // Custom colors state
  const [savedColors, setSavedColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('causar-custom-colors') || '[]') }
    catch { return [] }
  })

  // HEX/RGB creation state
  const [customHex, setCustomHex] = useState('')
  const [customR, setCustomR] = useState('')
  const [customG, setCustomG] = useState('')
  const [customB, setCustomB] = useState('')
  const [customPreview, setCustomPreview] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  
  const hoverTimersRef = useRef({})

  useEffect(() => {
    localStorage.setItem('causar-custom-colors', JSON.stringify(savedColors))
  }, [savedColors])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      Object.values(hoverTimersRef.current).forEach(clearTimeout)
    }
  }, [onClose])

  const saveCustomColor = (colorToSave) => {
    if (!colorToSave) return
    const norm = colorToSave.toUpperCase()
    setSavedColors(prev => prev.includes(norm) ? prev : [...prev, norm])
    setCustomHex(''); setCustomR(''); setCustomG(''); setCustomB('')
    setCustomPreview(null)
  }

  const removeCustomColor = (idx) => {
    setSavedColors(prev => prev.filter((_, i) => i !== idx))
    setDeleteTarget(null)
  }

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16)
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b }
  }

  const rgbToHex = (r, g, b) => {
    const toH = n => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0')
    return `#${toH(r)}${toH(g)}${toH(b)}`
  }

  const normalizeHex = (v) => {
    const raw = v.trim().replace(/^#+/, '')
    if (raw.length === 3) return '#' + raw.split('').map(c => c + c).join('')
    if (raw.length === 6) return '#' + raw
    return null
  }

  const handleHexChange = (v) => {
    setCustomHex(v)
    const hex = normalizeHex(v)
    if (hex) {
      const rgb = hexToRgb(hex)
      if (rgb) { setCustomR(rgb.r); setCustomG(rgb.g); setCustomB(rgb.b); setCustomPreview(hex) }
    } else setCustomPreview(null)
  }

  const handleRgbChange = (r, g, b) => {
    const rv = r === '' ? '' : Math.min(255, Math.max(0, parseInt(r) || 0))
    const gv = g === '' ? '' : Math.min(255, Math.max(0, parseInt(g) || 0))
    const bv = b === '' ? '' : Math.min(255, Math.max(0, parseInt(b) || 0))
    setCustomR(rv); setCustomG(gv); setCustomB(bv)
    if (rv !== '' && gv !== '' && bv !== '') {
      const hex = rgbToHex(rv, gv, bv)
      setCustomHex(hex.slice(1).toUpperCase())
      setCustomPreview(hex)
    } else setCustomPreview(null)
  }

  const startDeleteTimer = (idx) => {
    hoverTimersRef.current[idx] = setTimeout(() => setDeleteTarget(idx), 2000)
  }
  const cancelDeleteTimer = (idx) => {
    clearTimeout(hoverTimersRef.current[idx])
    delete hoverTimersRef.current[idx]
  }

  const handleSelect = (c) => {
    onChange(c)
    onClose()
  }

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, background: '#fff', border: '1px solid #d0d7de', borderRadius: 8,
        padding: '10px 10px 12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        width: 262,
      }}
    >
      {/* CORES PADRAO */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
        Cores Padrão
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 2, marginBottom: 10 }}>
        {EXCEL_THEME.map((col, ci) => {
          const c = col[0]
          const isCurrent = currentColor?.toUpperCase() === c.toUpperCase()
          return (
            <button key={`base-${ci}`} title={c} onClick={() => handleSelect(c)}
              style={{ width: '100%', aspectRatio: '1', borderRadius: 2, background: c,
                border: isCurrent ? '2px solid #0f172a' : '1.5px solid rgba(0,0,0,0.15)',
                cursor: 'pointer', outline: isCurrent ? '1px solid #fff' : 'none',
                outlineOffset: '-3px', transition: 'transform 0.1s, box-shadow 0.1s', padding: 0 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.18)'; e.currentTarget.style.zIndex = 2; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = 0; e.currentTarget.style.boxShadow = 'none' }}
            />
          )
        })}
        {[1, 2, 3, 4, 5].map(row =>
          EXCEL_THEME.map((col, ci) => {
            const c = col[row]
            const isCurrent = currentColor?.toUpperCase() === c.toUpperCase()
            return (
              <button key={`var-${row}-${ci}`} title={c} onClick={() => handleSelect(c)}
                style={{ width: '100%', aspectRatio: '1', borderRadius: 1, background: c,
                  border: isCurrent ? '2px solid #0f172a' : '1px solid transparent',
                  cursor: 'pointer', outline: isCurrent ? '1px solid #fff' : 'none',
                  outlineOffset: '-3px', transition: 'transform 0.1s, box-shadow 0.1s', padding: 0 }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.18)'; e.currentTarget.style.zIndex = 2; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = 0; e.currentTarget.style.boxShadow = 'none' }}
              />
            )
          })
        )}
      </div>

      {/* Divisor */}
      <div style={{ height: 1, background: '#e5e7eb', margin: '0 -10px 10px' }} />

      {/* CORES PERSONALIZADAS salvas */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>
        Cores Personalizadas
      </div>

      {savedColors.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {savedColors.map((c, idx) => {
            const isCurrent = currentColor?.toUpperCase() === c.toUpperCase()
            const isTarget = deleteTarget === idx
            return (
              <div
                key={`saved-${idx}`}
                style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}
                onMouseEnter={() => { if (!isTarget) startDeleteTimer(idx) }}
                onMouseLeave={() => { cancelDeleteTimer(idx); setDeleteTarget(null) }}
              >
                <button
                  title={isTarget ? 'Clique para remover' : c}
                  onClick={() => isTarget ? removeCustomColor(idx) : handleSelect(c)}
                  style={{
                    width: '100%', height: '100%', borderRadius: 4, background: c,
                    border: isCurrent ? '2px solid #0f172a' : '1.5px solid rgba(0,0,0,0.18)',
                    cursor: 'pointer', padding: 0,
                    outline: isCurrent ? '1px solid #fff' : 'none', outlineOffset: '-3px',
                    transition: 'transform 0.1s',
                  }}
                />
                {isTarget && (
                  <div
                    onClick={() => removeCustomColor(idx)}
                    title="Remover cor"
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 4,
                      background: 'rgba(220,38,38,0.90)',
                      color: '#fff', fontSize: 13, fontWeight: 900,
                      cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      animation: 'fadeIn 0.15s ease',
                    }}
                  >
                    ×
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginBottom: 10 }}>
          Nenhuma cor salva ainda
        </div>
      )}

      {/* Preview + HEX + RGB */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 4, background: customPreview || '#e5e7eb', border: '1.5px solid rgba(0,0,0,0.12)', flexShrink: 0, transition: 'background 0.15s', marginBottom: 1 }} />
        <div style={{ flex: 1.2 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>HEX</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>#</span>
            <input type="text" maxLength={7} placeholder="RRGGBB" value={customHex}
              onChange={e => handleHexChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && customPreview) saveCustomColor(customPreview) }}
              style={{ width: '100%', fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1.5px solid #d1d5db', outline: 'none', fontFamily: 'monospace', color: '#1e293b', letterSpacing: 1, background: 'white', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        {[['R', customR, v => handleRgbChange(v, customG, customB)], ['G', customG, v => handleRgbChange(customR, v, customB)], ['B', customB, v => handleRgbChange(customR, customG, v)]].map(([label, val, setter]) => (
          <div key={label} style={{ flex: 0.8 }}>
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 2, textAlign: 'center' }}>{label}</div>
            <input type="number" min="0" max="255" placeholder="0" value={val}
              onChange={e => setter(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && customPreview) saveCustomColor(customPreview) }}
              style={{ width: '100%', fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1.5px solid #d1d5db', outline: 'none', textAlign: 'center', color: '#1e293b', background: 'white', boxSizing: 'border-box' }}
            />
          </div>
        ))}
      </div>

      <button
        disabled={!customPreview}
        onClick={() => customPreview && saveCustomColor(customPreview)}
        style={{ width: '100%', padding: '5px 0', borderRadius: 5, fontSize: 11, fontWeight: 700, background: customPreview ? '#0f172a' : '#e5e7eb', color: customPreview ? '#fff' : '#9ca3af', border: 'none', cursor: customPreview ? 'pointer' : 'not-allowed', transition: 'background 0.15s, opacity 0.15s', boxShadow: customPreview ? '0 2px 8px rgba(0,0,0,0.15)' : 'none', letterSpacing: 0.3 }}
        onMouseEnter={e => customPreview && (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        Salvar
      </button>

      {/* Children from parent (like Estilo da Linha) */}
      {children}
    </div>
  )
}
