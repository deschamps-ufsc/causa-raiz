import { useState, useEffect } from 'react'
import api, { importPanFile } from "../../services/api"

export default function ModulosTab({ readOnly }) {
  const [modulos, setModulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Fields: Nome, Potência Nominal (W), Isc, Voc, Imp, Vmp, alpha, beta, gamma, Células em série
  const defaultModulo = {
    id: Date.now().toString(),
    nome: 'Novo Módulo',
    potencia: 550,
    isc: 14.0,
    voc: 50.0,
    imp: 13.1,
    vmp: 42.0,
    alpha: 0.04,
    beta: -0.28,
    gamma: -0.35,
    celulas: 144
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const res = await api.get('/settings/equipamentos')
      if (res.data && res.data.modulos) {
        setModulos(res.data.modulos)
      }
    } catch (error) {
      console.error("Erro ao carregar equipamentos:", error)
    } finally {
      setLoading(false)
    }
  }

  const saveData = async (newModulos) => {
    if (readOnly) return
    setSaving(true)
    try {
      // Fetch full equipamentos first to not overwrite inversores
      const res = await api.get('/settings/equipamentos')
      const fullData = res.data || { modulos: [], inversores: [] }
      fullData.modulos = newModulos
      
      await api.put('/settings/equipamentos', fullData)
    } catch (error) {
      console.error("Erro ao salvar módulos:", error)
      alert("Erro ao salvar os módulos.")
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    if (readOnly) return
    const novo = { ...defaultModulo, id: Date.now().toString() }
    const updated = [...modulos, novo]
    setModulos(updated)
    saveData(updated)
  }

  const handleImportPan = async (e) => {
    if (readOnly) return
    const file = e.target.files[0]
    if (!file) return
    
    setSaving(true)
    try {
      const res = await importPanFile(file)
      if (res.status === 'ok' && res.data) {
        const panKey = Object.keys(res.data)[0]
        const pan = res.data[panKey] || {}
        const comercial = pan.PVObject_Commercial || {}
        let fileName = file.name ? file.name.replace(/\.pan$/i, '') : panKey
        if (fileName === 'PVObject_' || fileName.includes('\ufeffPVObject_')) fileName = 'Módulo Importado'
        const novo = {
          id: Date.now().toString(),
          nome: comercial.Model || pan.Model || fileName,
          potencia: parseFloat(pan.PNom) || parseFloat(pan.Pnom) || parseFloat(pan.W_nom) || defaultModulo.potencia,
          isc: parseFloat(pan.Isc) || defaultModulo.isc,
          voc: parseFloat(pan.Voc) || defaultModulo.voc,
          imp: parseFloat(pan.Imp) || defaultModulo.imp,
          vmp: parseFloat(pan.Vmp) || defaultModulo.vmp,
          alpha: parseFloat(pan.muISC) || parseFloat(pan.mu_isc) || defaultModulo.alpha, // PVSyst PAN has muISC
          beta: parseFloat(pan.muVocSpec) || parseFloat(pan.mu_voc) || defaultModulo.beta,
          gamma: parseFloat(pan.muPmpReq) || parseFloat(pan.mu_pmp) || defaultModulo.gamma,
          celulas: parseInt(pan.NCelS) || defaultModulo.celulas,
          raw_data: pan
        }
        const updated = [...modulos, novo]
        setModulos(updated)
        await saveData(updated)
      }
    } catch (error) {
      console.error("Erro ao importar .PAN:", error)
      alert("Erro ao importar arquivo .PAN. " + (error.message || ""))
    } finally {
      setSaving(false)
      e.target.value = null // reset input
    }
  }

  const handleRemove = (id) => {
    if (readOnly) return
    if (!window.confirm("Remover este módulo?")) return
    const updated = modulos.filter(m => m.id !== id)
    setModulos(updated)
    saveData(updated)
  }

  const handleChange = (id, field, value) => {
    if (readOnly) return
    const updated = modulos.map(m => {
      if (m.id === id) {
        return { ...m, [field]: value }
      }
      return m
    })
    setModulos(updated)
  }

  const handleBlur = () => {
    if (readOnly) return
    saveData(modulos)
  }

  if (loading) return <div style={{ padding: 20 }}>Carregando...</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Módulos</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>Fichas técnicas de módulos (STC) para o PVLib.</p>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <label style={{ padding: '8px 16px', background: '#e2e8f0', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📥</span> Importar .PAN
              <input type="file" accept=".pan" style={{ display: 'none' }} onChange={handleImportPan} disabled={saving} />
            </label>
            <button onClick={handleAdd} disabled={saving} style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>+</span> Novo Módulo
            </button>
          </div>
        )}
      </div>

      {modulos.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          Nenhum módulo cadastrado.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 1000 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Nome do Modelo</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Potência (W)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Isc (A)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Voc (V)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Imp (A)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Vmp (V)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>α Isc (%/°C)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>β Voc (%/°C)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>γ Pmax (%/°C)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Células</th>
                <th style={{ padding: '12px 16px', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {modulos.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i === modulos.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="text" value={m.nome} onChange={e => handleChange(m.id, 'nome', e.target.value)} onBlur={handleBlur} disabled={readOnly} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" value={m.potencia} onChange={e => handleChange(m.id, 'potencia', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" step="0.01" value={m.isc} onChange={e => handleChange(m.id, 'isc', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" step="0.1" value={m.voc} onChange={e => handleChange(m.id, 'voc', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" step="0.01" value={m.imp} onChange={e => handleChange(m.id, 'imp', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" step="0.1" value={m.vmp} onChange={e => handleChange(m.id, 'vmp', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" step="0.001" value={m.alpha} onChange={e => handleChange(m.id, 'alpha', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" step="0.01" value={m.beta} onChange={e => handleChange(m.id, 'beta', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" step="0.01" value={m.gamma} onChange={e => handleChange(m.id, 'gamma', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" value={m.celulas} onChange={e => handleChange(m.id, 'celulas', parseInt(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: 80, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                    {!readOnly && (
                      <button onClick={() => handleRemove(m.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
