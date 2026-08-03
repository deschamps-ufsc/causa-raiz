import { useState, useEffect } from 'react'
import api, { importOndFile } from "../../services/api"

export default function InversoresTab({ readOnly }) {
  const [inversores, setInversores] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Fields: Nome do Modelo, Paco, Pdco, Vdco, Pso
  const defaultInversor = {
    id: Date.now().toString(),
    nome: 'Novo Inversor',
    paco: 250000,
    pdco: 256000,
    vdco: 1080,
    pso: 500
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const res = await api.get('/settings/equipamentos')
      if (res.data && res.data.inversores) {
        setInversores(res.data.inversores)
      }
    } catch (error) {
      console.error("Erro ao carregar equipamentos:", error)
    } finally {
      setLoading(false)
    }
  }

  const saveData = async (newInversores) => {
    if (readOnly) return
    setSaving(true)
    try {
      // Fetch full equipamentos first to not overwrite modulos
      const res = await api.get('/settings/equipamentos')
      const fullData = res.data || { modulos: [], inversores: [] }
      fullData.inversores = newInversores
      
      await api.put('/settings/equipamentos', fullData)
    } catch (error) {
      console.error("Erro ao salvar inversores:", error)
      alert("Erro ao salvar os inversores.")
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    if (readOnly) return
    const novo = { ...defaultInversor, id: Date.now().toString() }
    const updated = [...inversores, novo]
    setInversores(updated)
    saveData(updated)
  }

  const handleImportOnd = async (e) => {
    if (readOnly) return
    const file = e.target.files[0]
    if (!file) return
    
    setSaving(true)
    try {
      const res = await importOndFile(file)
      if (res.status === 'ok' && res.data) {
        const ondKey = Object.keys(res.data)[0]
        const ond = res.data[ondKey] || {}
        const comercial = ond.PVObject_Commercial || {}
        const conv = ond.Converter || {}
        
        let fileName = file.name ? file.name.replace(/\.ond$/i, '') : ondKey
        if (fileName === 'PVObject_' || fileName.includes('\ufeffPVObject_')) fileName = 'Inversor Importado'
        
        // Em arquivos OND os valores de potência geralmente estão em kW, dependendo do campo UnitAffEnum.
        // Como o PVlib PVSyst converte ou mantém cru, muitas vezes 'PNomConv' é em kW. 
        // Vamos checar se precisamos multiplicar por 1000 assumindo que o painel quer em Watts.
        const multiplier = (conv.UnitAffEnum === 'kW') ? 1000 : 1
        
        const paco = (parseFloat(conv.PNomConv) || parseFloat(ond.PNomAC) || parseFloat(ond.PNom) || parseFloat(ond.Pnom) || parseFloat(ond.PnomAC) || defaultInversor.paco / multiplier) * multiplier
        const pdco = (parseFloat(conv.PMaxOUT) || parseFloat(ond.PNomDC) || parseFloat(ond.PNom_DC) || parseFloat(ond.PnomDC) || parseFloat(ond.PMaxDC) || defaultInversor.pdco / multiplier) * multiplier
        const vdco = parseFloat(conv.VOutConv) || parseFloat(ond.Vnom) || parseFloat(ond.VNom) || parseFloat(ond.VOut) || defaultInversor.vdco
        const pso = (parseFloat(conv.PSeuil) || parseFloat(ond.Pso) || parseFloat(ond.PSo) || parseFloat(ond.P_so) || defaultInversor.pso) // PSeuil geralmente é em Watts.
        
        const novo = {
          id: Date.now().toString(),
          nome: comercial.Model || ond.Model || fileName,
          paco: paco,
          pdco: pdco,
          vdco: vdco,
          pso: pso,
          raw_data: ond
        }
        const updated = [...inversores, novo]
        setInversores(updated)
        await saveData(updated)
      }
    } catch (error) {
      console.error("Erro ao importar .OND:", error)
      alert("Erro ao importar arquivo .OND. " + (error.message || ""))
    } finally {
      setSaving(false)
      e.target.value = null // reset input
    }
  }

  const handleRemove = (id) => {
    if (readOnly) return
    if (!window.confirm("Remover este inversor?")) return
    const updated = inversores.filter(m => m.id !== id)
    setInversores(updated)
    saveData(updated)
  }

  const handleChange = (id, field, value) => {
    if (readOnly) return
    const updated = inversores.map(m => {
      if (m.id === id) {
        return { ...m, [field]: value }
      }
      return m
    })
    setInversores(updated)
  }

  const handleBlur = () => {
    if (readOnly) return
    saveData(inversores)
  }

  if (loading) return <div style={{ padding: 20 }}>Carregando...</div>

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Inversores</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>Fichas técnicas de inversores para o modelo de rendimento (PVLib).</p>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <label style={{ padding: '8px 16px', background: '#e2e8f0', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📥</span> Importar .OND
              <input type="file" accept=".ond" style={{ display: 'none' }} onChange={handleImportOnd} disabled={saving} />
            </label>
            <button onClick={handleAdd} disabled={saving} style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>+</span> Novo Inversor
            </button>
          </div>
        )}
      </div>

      {inversores.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          Nenhum inversor cadastrado.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Nome do Modelo</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Paco Nom. AC (W)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Pdco Máx. DC (W)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Vdco Nom. DC (V)</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Pso Partida (W)</th>
                <th style={{ padding: '12px 16px', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {inversores.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i === inversores.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="text" value={m.nome} onChange={e => handleChange(m.id, 'nome', e.target.value)} onBlur={handleBlur} disabled={readOnly} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" value={m.paco} onChange={e => handleChange(m.id, 'paco', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" value={m.pdco} onChange={e => handleChange(m.id, 'pdco', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" value={m.vdco} onChange={e => handleChange(m.id, 'vdco', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <input type="number" value={m.pso} onChange={e => handleChange(m.id, 'pso', parseFloat(e.target.value)||0)} onBlur={handleBlur} disabled={readOnly} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: readOnly ? '#f8fafc' : '#fff' }} />
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
