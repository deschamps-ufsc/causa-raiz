import React, { useState, useEffect } from 'react'
import { fetchDetailedUsinas, createUsina, renameUsina, deleteUsina, saveUsinasOrder } from '../../services/api'
import { useAuth } from '../../hooks/AuthContext'
import UsinaDetail from './UsinaDetail'

function UsinaRow({ u, index, readOnly, setSelectedUsina, onEdit, setDeleteConfirm, reorderUsinas, draggedIndex, setDraggedIndex, draggedOverIndex, setDraggedOverIndex }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = (e) => {
    if (readOnly) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    setDraggedIndex(index);
    setTimeout(() => setIsDragging(true), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedIndex(null);
    setDraggedOverIndex(null);
  };

  const handleDragOver = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedOverIndex !== index) {
      setDraggedOverIndex(index);
    }
  };

  const handleDrop = (e) => {
    if (readOnly) return;
    e.preventDefault();
    setDraggedIndex(null);
    setDraggedOverIndex(null);
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(dragIndex) && dragIndex !== index) {
      reorderUsinas(dragIndex, index);
    }
  };

  const isDragOver = draggedOverIndex === index;
  let dragBorderTop = '1px solid #f1f5f9';
  let dragBorderBottom = 'none';

  if (isDragOver && draggedIndex !== null && draggedIndex !== index) {
    if (draggedIndex > index) {
      dragBorderTop = '2px solid #0ea5e9';
    } else {
      dragBorderBottom = '2px solid #0ea5e9';
    }
  }

  return (
    <tr
      style={{ 
        background: 'transparent', transition: 'background 0.15s', cursor: 'pointer',
        borderBottom: '1px solid #f1f5f9'
      }}
      onClick={() => setSelectedUsina(u)}
      onMouseEnter={e => { e.currentTarget.style.background = '#fef9ec'; setIsHovered(true) }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; setIsHovered(false) }}
    >
      <td style={{ padding: '12px 12px 12px 56px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {u.nome}
        </div>
      </td>

      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#15803d' }}>
        {u.total_mwp.toFixed(2)} <span style={{ fontSize: 9, fontWeight: 400 }}>MWp</span>
      </td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_skids || 0}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_inversores || 0}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_stringboxes || 0}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_trackers || 0}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_strings}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_modulos}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{(u.count_series || 0) - (u.total_sinteticas || 0)}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_sinteticas}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.total_processadas}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.count_elementos}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.dias_presentes}</td>
      <td style={{ padding: '12px', textAlign: 'center' }}>{u.count_campanhas || 0}</td>
      <td style={{ padding: '12px', textAlign: 'center', minWidth: 70 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {!readOnly && (
            <>
              <button
                onClick={e => { 
                  e.stopPropagation(); 
                  onEdit(u);
                }}
                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff' }}
                title="Editar usina"
              >✏️</button>
              <button
                onClick={e => { e.stopPropagation(); setDeleteConfirm(u.nome) }}
                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff', color: '#dc2626', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fee2e2' }}
                title="Excluir usina"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function UsinasTab({ readOnly = false }) {
  const { user: currentUser } = useAuth()
  const [usinas, setUsinas] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingUsina, setEditingUsina] = useState(null)
  const [newName, setNewName] = useState('')
  const [newCliente, setNewCliente] = useState('')
  const [newComplexo, setNewComplexo] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [selectedUsina, setSelectedUsina] = useState(null) // usina object being viewed
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [draggedOverIndex, setDraggedOverIndex] = useState(null)
  const [expandedClientes, setExpandedClientes] = useState({})
  const [expandedComplexos, setExpandedComplexos] = useState({})

  const [isDuplicating, setIsDuplicating] = useState(false)
  const [duplicarDe, setDuplicarDe] = useState('')
  const [duplicarOptions, setDuplicarOptions] = useState({
    mapeamento: false,
    infos_usina: false,
    sinteticas: false,
    fluxograma: false,
    dados_diarios: false
  })

  const reorderUsinas = async (dragIndex, dropIndex) => {
    try {
      const result = Array.from(usinas);
      const [removed] = result.splice(dragIndex, 1);
      result.splice(dropIndex, 0, removed);
      
      setUsinas(result);
      
      const order = result.map(u => u.nome);
      await saveUsinasOrder(order);
    } catch (err) {
      setFeedback({ type: 'error', msg: 'Erro ao salvar a nova ordem das usinas.' })
      // Opcionalmente recarregar para restaurar a ordem original
      loadUsinas()
    }
  }

  const loadUsinas = async () => {
    try {
      setLoading(true)
      const data = await fetchDetailedUsinas()
      setUsinas(data)
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsinas() }, [])

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleCreateOrRename = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      if (editingUsina) {
        const payload = {
          novo_nome: newName.trim(),
          cliente: newCliente.trim() || null,
          complexo: newComplexo.trim() || null
        }
        await renameUsina(editingUsina.nome, payload)
        showFeedback('success', 'Usina atualizada com sucesso.')
      } else {
        const payload = {
          nome: newName.trim(),
          cliente: newCliente.trim() || null,
          complexo: newComplexo.trim() || null,
          duplicar_de: isDuplicating && duplicarDe ? duplicarDe : null,
          duplicar_mapeamento: isDuplicating ? duplicarOptions.mapeamento : false,
          duplicar_infos_usina: isDuplicating ? duplicarOptions.infos_usina : false,
          duplicar_sinteticas: isDuplicating ? duplicarOptions.sinteticas : false,
          duplicar_fluxograma: isDuplicating ? duplicarOptions.fluxograma : false,
          duplicar_dados_diarios: isDuplicating ? duplicarOptions.dados_diarios : false
        }
        await createUsina(payload)
        showFeedback('success', 'Nova usina criada com sucesso.')
      }
      setShowModal(false)
      setNewName('')
      setNewCliente('')
      setNewComplexo('')
      setEditingUsina(null)
      loadUsinas()
    } catch (err) {
      showFeedback('error', err.message)
    }
  }

  const handleDelete = async (nome) => {
    try {
      await deleteUsina(nome)
      setDeleteConfirm(null)
      showFeedback('success', `Usina ${nome} removida.`)
      loadUsinas()
    } catch (err) {
      showFeedback('error', err.message)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando usinas...</div>

  // ── Sub-view: usina selecionada ──────────────────────────────────────────
  if (selectedUsina) {
    return (
      <div>
        {/* Breadcrumb + Voltar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, paddingBottom: 12, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          {/* Seletor de usina no canto esquerdo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', height: 32, boxSizing: 'border-box' }}>
            <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>🏭 Usina:</span>
            <select
              value={selectedUsina.nome || ''}
              onChange={e => {
                const targetUsina = usinas.find(u => u.nome === e.target.value)
                if (targetUsina) setSelectedUsina(targetUsina)
              }}
              style={{
                background: 'transparent', border: 'none', color: '#0f172a',
                fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer',
                fontFamily: 'inherit', maxWidth: 260, height: '100%',
              }}
            >
              {usinas.map(u => <option key={u.nome} value={u.nome}>{u.nome}</option>)}
            </select>
          </div>

          {/* Badges + Botão Voltar no canto direito */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Badges de Informações da Usina */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginRight: 4 }}>
              <div style={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', borderRadius: 6, color: '#475569', display: 'flex', alignItems: 'center', height: 32, boxSizing: 'border-box' }} title="Potência da usina">
                <span>⚡ <strong style={{ color: '#15803d' }}>{selectedUsina.total_mwp.toFixed(2)}</strong> MWp</span>
              </div>
              <div style={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', borderRadius: 6, color: '#475569', display: 'flex', alignItems: 'center', height: 32, boxSizing: 'border-box' }} title="Total de Strings">
                <span>🔌 <strong>{selectedUsina.total_strings}</strong> Strings</span>
              </div>
              <div style={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', borderRadius: 6, color: '#475569', display: 'flex', alignItems: 'center', height: 32, boxSizing: 'border-box' }} title="Total de Módulos">
                <span>📦 <strong>{selectedUsina.total_modulos}</strong> Módulos</span>
              </div>
              <div style={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', borderRadius: 6, color: '#475569', display: 'flex', alignItems: 'center', height: 32, boxSizing: 'border-box' }} title="Total de Elementos">
                <span>📊 <strong>{selectedUsina.count_elementos}</strong> Elementos</span>
              </div>
              <div style={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', borderRadius: 6, color: '#475569', display: 'flex', alignItems: 'center', height: 32, boxSizing: 'border-box' }} title="Total de Séries">
                <span>📈 <strong>{selectedUsina.count_series}</strong> Séries</span>
              </div>
              <div style={{ fontSize: 11, background: '#fff', border: '1px solid #e2e8f0', padding: '0 8px', borderRadius: 6, color: '#475569', display: 'flex', alignItems: 'center', height: 32, boxSizing: 'border-box' }} title="Total de Séries Sintéticas">
                <span>🧪 <strong>{selectedUsina.total_sinteticas}</strong> Sintéticas</span>
              </div>
            </div>

            {/* Botão Voltar Laranja */}
            <button
              onClick={() => setSelectedUsina(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 14px', borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
                boxShadow: '0 2px 6px rgba(245,158,11,0.2)',
                height: 32, boxSizing: 'border-box'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(245,158,11,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(245,158,11,0.2)' }}
            >
              ← Voltar
            </button>
          </div>
        </div>
        <UsinaDetail usina={selectedUsina.nome} usinaObj={selectedUsina} />
      </div>
    )
  }

  const tree = {};
  usinas.forEach(u => {
    const c = u.cliente || 'Sem Cliente';
    const comp = u.complexo || 'Sem Complexo';
    if (!tree[c]) tree[c] = {};
    if (!tree[c][comp]) tree[c][comp] = [];
    tree[c][comp].push(u);
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Gerencie as usinas solares cadastradas e suas estatísticas agregadas.</p>
        </div>
        {!readOnly && (
          <button 
            onClick={() => { 
              setEditingUsina(null); 
              setNewName(''); 
              setIsDuplicating(false);
              setDuplicarDe('');
              setDuplicarOptions({ mapeamento: false, infos_usina: false, sinteticas: false, fluxograma: false, dados_diarios: false });
              setShowModal(true); 
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#f59e0b,#f97316)',
              color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            + Nova Usina
          </button>
        )}
      </div>

      {feedback && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${feedback.type === 'success' ? '#86efac' : '#fecaca'}`,
          color: feedback.type === 'success' ? '#065f46' : '#991b1b',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {feedback.type === 'success' ? '✅' : '⚠️'} {feedback.msg}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right,#f8fafc,#fff)' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Usinas Cadastradas</h2>
        </div>

        {usinas.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhuma usina encontrada.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Usina'].map(l => (
                    <th key={l} rowSpan={2} style={{ 
                      padding: '10px 12px', textAlign: 'left', 
                      fontWeight: 700, color: '#94a3b8', fontSize: 10, 
                      letterSpacing: 0.5, textTransform: 'uppercase', 
                      borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
                      verticalAlign: 'middle',
                      borderRight: '1px solid #e2e8f0'
                    }}>{l}</th>
                  ))}

                  <th colSpan={7} style={{ 
                    padding: '6px 12px', textAlign: 'center', 
                    fontWeight: 700, color: '#94a3b8', fontSize: 10, 
                    letterSpacing: 0.5, textTransform: 'uppercase', 
                    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                    borderRight: '1px solid #e2e8f0'
                  }}>Dados Técnicos</th>

                  <th colSpan={3} style={{ 
                    padding: '6px 12px', textAlign: 'center', 
                    fontWeight: 700, color: '#94a3b8', fontSize: 10, 
                    letterSpacing: 0.5, textTransform: 'uppercase', 
                    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                    borderRight: '1px solid #e2e8f0'
                  }}>Séries</th>

                  {['Elementos', 'Dias', 'Campanhas', 'Ações'].map((l, i) => (
                    <th key={l} rowSpan={2} style={{ 
                      padding: '10px 12px', textAlign: 'center', 
                      fontWeight: 700, color: '#94a3b8', fontSize: 10, 
                      letterSpacing: 0.5, textTransform: 'uppercase', 
                      borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
                      verticalAlign: 'middle'
                    }}>{l}</th>
                  ))}
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  {['Potência', 'Skids', 'Inversores', 'Stringboxes', 'Trackers', 'Strings', 'Módulos'].map((l, i) => (
                    <th key={l} style={{ 
                      padding: '10px 12px', textAlign: 'center', 
                      fontWeight: 700, color: '#94a3b8', fontSize: 10, 
                      letterSpacing: 0.5, textTransform: 'uppercase', 
                      borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
                      paddingTop: 4,
                      borderRight: i === 6 ? '1px solid #e2e8f0' : 'none'
                    }}>{l}</th>
                  ))}
                  {['Nativas', 'Sintéticas', 'Processadas'].map((l, i) => (
                    <th key={l} style={{ 
                      padding: '10px 12px', textAlign: 'center', 
                      fontWeight: 700, color: '#94a3b8', fontSize: 10, 
                      letterSpacing: 0.5, textTransform: 'uppercase', 
                      borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap',
                      paddingTop: 4,
                      borderRight: i === 2 ? '1px solid #e2e8f0' : 'none'
                    }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(tree).sort().map(cliente => {
                  const isCliOpen = expandedClientes[cliente] !== false; // Default to true
                  return (
                    <React.Fragment key={`cli-${cliente}`}>
                      <tr onClick={() => setExpandedClientes(p => ({...p, [cliente]: !isCliOpen}))} style={{ background: '#f8fafc', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                        <td colSpan={15} style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>
                          <span style={{ display: 'inline-block', width: 20, color: '#64748b', fontSize: 10 }}>{isCliOpen ? '▼' : '▶'}</span>
                          🏢 {cliente}
                        </td>
                      </tr>
                      {isCliOpen && Object.keys(tree[cliente]).sort().map(complexo => {
                        const compKey = `${cliente}-${complexo}`;
                        const isCompOpen = expandedComplexos[compKey] !== false;
                        return (
                          <React.Fragment key={`comp-${compKey}`}>
                            <tr onClick={() => setExpandedComplexos(p => ({...p, [compKey]: !isCompOpen}))} style={{ background: '#fcfcfc', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                              <td colSpan={15} style={{ padding: '6px 12px 6px 32px', fontWeight: 600, color: '#334155' }}>
                                <span style={{ display: 'inline-block', width: 20, color: '#94a3b8', fontSize: 10 }}>{isCompOpen ? '▼' : '▶'}</span>
                                🏭 {complexo}
                              </td>
                            </tr>
                            {isCompOpen && tree[cliente][complexo].sort((a,b) => a.nome.localeCompare(b.nome)).map((u, idx) => (
                              <UsinaRow
                                key={u.nome}
                                u={u}
                                index={idx}
                                readOnly={readOnly}
                                setSelectedUsina={setSelectedUsina}
                                onEdit={(u) => {
                                  setEditingUsina(u);
                                  setNewName(u.nome);
                                  setNewCliente(u.cliente || '');
                                  setNewComplexo(u.complexo || '');
                                  setShowModal(true);
                                }}
                                setDeleteConfirm={setDeleteConfirm}
                                reorderUsinas={reorderUsinas}
                                draggedIndex={draggedIndex}
                                setDraggedIndex={setDraggedIndex}
                                draggedOverIndex={draggedOverIndex}
                                setDraggedOverIndex={setDraggedOverIndex}
                              />
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Criar/Editar */}
      {showModal && (
        <div style={{ 
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', 
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', 
          justifyContent: 'center', zIndex: 9999 
        }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ 
            background: '#fff', borderRadius: 16, padding: '28px 28px 24px', 
            width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                {editingUsina ? 'Renomear Usina' : 'Nova Usina'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>
            
            <form onSubmit={handleCreateOrRename}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome da Usina</label>
                <input 
                  autoFocus
                  style={{ 
                    width: '100%', boxSizing: 'border-box', background: '#f8fafc', 
                    border: '1.5px solid #e2e8f0', borderRadius: 8, color: '#0f172a', 
                    padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', 
                    outline: 'none', transition: 'border-color 0.2s', marginBottom: 16
                  }}
                  placeholder="Ex: Usina Solar Central"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#f59e0b'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />

                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cliente</label>
                <input 
                  list="clientes-list"
                  style={{ 
                    width: '100%', boxSizing: 'border-box', background: '#f8fafc', 
                    border: '1.5px solid #e2e8f0', borderRadius: 8, color: '#0f172a', 
                    padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', 
                    outline: 'none', transition: 'border-color 0.2s', marginBottom: 16
                  }}
                  placeholder="Ex: Athon"
                  value={newCliente}
                  onChange={e => setNewCliente(e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#f59e0b'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <datalist id="clientes-list">
                  {Array.from(new Set(usinas.map(u => u.cliente).filter(Boolean))).map(c => <option key={c} value={c} />)}
                </datalist>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Complexo</label>
                <input 
                  list="complexos-list"
                  style={{ 
                    width: '100%', boxSizing: 'border-box', background: '#f8fafc', 
                    border: '1.5px solid #e2e8f0', borderRadius: 8, color: '#0f172a', 
                    padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', 
                    outline: 'none', transition: 'border-color 0.2s'
                  }}
                  placeholder="Ex: Larissa"
                  value={newComplexo}
                  onChange={e => setNewComplexo(e.target.value)}
                  onFocus={e => e.target.style.borderColor = '#f59e0b'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <datalist id="complexos-list">
                  {Array.from(new Set(usinas.map(u => u.complexo).filter(Boolean))).map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              {!editingUsina && usinas.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f172a', fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                    <input 
                      type="checkbox" 
                      checked={isDuplicating} 
                      onChange={e => setIsDuplicating(e.target.checked)} 
                      style={{ width: 16, height: 16, accentColor: '#f59e0b' }}
                    />
                    Duplicar de uma usina existente
                  </label>

                  {isDuplicating && (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <select
                        value={duplicarDe}
                        onChange={e => setDuplicarDe(e.target.value)}
                        style={{ 
                          width: '100%', boxSizing: 'border-box', background: '#fff', 
                          border: '1px solid #cbd5e1', borderRadius: 6, color: '#0f172a', 
                          padding: '8px 10px', fontSize: 13, marginBottom: 12, outline: 'none' 
                        }}
                      >
                        <option value="">Selecione a usina de origem...</option>
                        {usinas.map(u => (
                          <option key={u.nome} value={u.nome}>{u.nome}</option>
                        ))}
                      </select>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>O que trazer?</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                          <input type="checkbox" checked={duplicarOptions.mapeamento} onChange={e => setDuplicarOptions(p => ({ ...p, mapeamento: e.target.checked }))} style={{ accentColor: '#f59e0b' }} />
                          Arquivos de mapeamento das séries (Mapeamento)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                          <input type="checkbox" checked={duplicarOptions.infos_usina} onChange={e => setDuplicarOptions(p => ({ ...p, infos_usina: e.target.checked }))} style={{ accentColor: '#f59e0b' }} />
                          Infos Usina
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                          <input type="checkbox" checked={duplicarOptions.sinteticas} onChange={e => setDuplicarOptions(p => ({ ...p, sinteticas: e.target.checked }))} style={{ accentColor: '#f59e0b' }} />
                          Séries sintéticas
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                          <input type="checkbox" checked={duplicarOptions.dados_diarios} onChange={e => setDuplicarOptions(p => ({ ...p, dados_diarios: e.target.checked }))} style={{ accentColor: '#f59e0b' }} />
                          Arquivos de dados diários (Dados e Campanhas)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                          <input type="checkbox" checked={duplicarOptions.fluxograma} onChange={e => setDuplicarOptions(p => ({ ...p, fluxograma: e.target.checked }))} style={{ accentColor: '#f59e0b' }} />
                          Configurações da aba fluxograma (Bloquinhos)
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                <button type="submit" disabled={!newName.trim() || (isDuplicating && !duplicarDe)} style={{ 
                  padding: '9px 18px', borderRadius: 8, border: 'none', 
                  background: 'linear-gradient(135deg,#f59e0b,#f97316)', color: '#fff', 
                  cursor: (!newName.trim() || (isDuplicating && !duplicarDe)) ? 'not-allowed' : 'pointer', fontSize: 13, 
                  fontWeight: 700, opacity: (!newName.trim() || (isDuplicating && !duplicarDe)) ? 0.7 : 1 
                }}>
                  {editingUsina ? 'Renomear' : 'Criar Usina'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmação Exclusão */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Confirmar Exclusão</h3>
                <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                    Tem certeza que deseja excluir a usina <strong>{deleteConfirm}</strong>? Esta ação não pode ser desfeita e todos os dados serão perdidos.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setDeleteConfirm(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                    <button onClick={() => handleDelete(deleteConfirm)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Excluir Usina</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
