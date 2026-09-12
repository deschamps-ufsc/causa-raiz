import { useState, useRef, useEffect } from 'react';
import { fetchCampanhas } from '../services/api';

export default function UsinaSelector({ usinas, usinaAtual, setUsinaAtual, campanhaAtual, setCampanhaAtual }) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedClientes, setExpandedClientes] = useState({});
  const [expandedComplexos, setExpandedComplexos] = useState({});
  const [expandedUsinas, setExpandedUsinas] = useState({});
  const [todasCampanhas, setTodasCampanhas] = useState({});
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCampanhas().then(setTodasCampanhas).catch(() => {});
    }
  }, [isOpen]);

  // Agrupar usinas
  const tree = {}; // { cliente: { complexo: [usina1, usina2] } }
  
  usinas.forEach(u => {
    // Para retrocompatibilidade caso `u` seja string
    let nome, c, comp;
    if (typeof u === 'string') {
      nome = u;
      c = 'Sem Cliente';
      comp = 'Sem Complexo';
    } else {
      nome = u.nome;
      c = u.cliente || 'Sem Cliente';
      comp = u.complexo || 'Sem Complexo';
    }

    if (!tree[c]) tree[c] = {};
    if (!tree[c][comp]) tree[c][comp] = [];
    tree[c][comp].push({ nome, cliente: c, complexo: comp });
  });

  const toggleCliente = (c, e) => {
    e.stopPropagation();
    setExpandedClientes(prev => ({ ...prev, [c]: !prev[c] }));
  };

  const toggleComplexo = (c, comp, e) => {
    e.stopPropagation();
    const key = `${c}-${comp}`;
    setExpandedComplexos(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleUsina = (u_nome, e) => {
    e.stopPropagation();
    setExpandedUsinas(prev => ({ ...prev, [u_nome]: !prev[u_nome] }));
  };

  const selectUsinaCampanha = (nome, campanha) => {
    setUsinaAtual(nome);
    setCampanhaAtual(campanha);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: 'flex', alignItems: 'center', gap: 8, 
          background: 'rgba(0,0,0,0.15)', padding: '4px 10px', 
          borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer', userSelect: 'none'
        }}
      >
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>🏭 Usina:</span>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 180 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {usinaAtual || '-- Selecionar --'}
          </span>
          {usinaAtual && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {campanhaAtual ? `🎯 ${campanhaAtual}` : 'Todos os dias'}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#fff', marginLeft: 4 }}>▼</span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: 280, maxHeight: 400, overflowY: 'auto', zIndex: 9999,
          border: '1px solid #e2e8f0', padding: '8px 0'
        }}>
          {Object.keys(tree).sort().map(cliente => (
            <div key={cliente}>
              <div 
                onClick={(e) => toggleCliente(cliente, e)}
                style={{
                  padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  fontWeight: 700, fontSize: 13, color: '#0f172a', background: expandedClientes[cliente] ? '#f8fafc' : 'transparent'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = expandedClientes[cliente] ? '#f8fafc' : 'transparent'}
              >
                <span style={{ width: 16, display: 'inline-block', fontSize: 10, color: '#64748b' }}>
                  {expandedClientes[cliente] ? '▼' : '▶'}
                </span>
                {cliente}
              </div>
              
              {expandedClientes[cliente] && (
                <div style={{ background: '#f8fafc' }}>
                  {Object.keys(tree[cliente]).sort().map(complexo => {
                    const key = `${cliente}-${complexo}`;
                    return (
                      <div key={complexo}>
                        <div
                          onClick={(e) => toggleComplexo(cliente, complexo, e)}
                          style={{
                            padding: '6px 16px 6px 28px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            fontWeight: 600, fontSize: 12, color: '#334155'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ width: 16, display: 'inline-block', fontSize: 10, color: '#94a3b8' }}>
                            {expandedComplexos[key] ? '▼' : '▶'}
                          </span>
                          {complexo}
                        </div>
                        
                        {expandedComplexos[key] && (
                          <div style={{ background: '#fff', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                            {tree[cliente][complexo].sort((a, b) => a.nome.localeCompare(b.nome)).map(u => {
                              const isUsinaOpen = expandedUsinas[u.nome];
                              const campanhas = todasCampanhas[u.nome] || {};
                              
                              return (
                                <div key={u.nome}>
                                  <div
                                    onClick={() => selectUsinaCampanha(u.nome, null)}
                                    style={{
                                      padding: '8px 16px 8px 48px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                      fontSize: 12, color: usinaAtual === u.nome ? '#2563eb' : '#475569',
                                      fontWeight: usinaAtual === u.nome ? 600 : 400,
                                      background: usinaAtual === u.nome ? '#eff6ff' : 'transparent'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = usinaAtual === u.nome ? '#eff6ff' : '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = usinaAtual === u.nome ? '#eff6ff' : 'transparent'}
                                  >
                                    <span 
                                      onClick={(e) => toggleUsina(u.nome, e)}
                                      style={{ width: 16, display: 'inline-block', fontSize: 10, color: '#94a3b8', cursor: 'pointer' }}
                                    >
                                      {isUsinaOpen ? '▼' : '▶'}
                                    </span>
                                    {u.nome}
                                  </div>
                                  
                                  {isUsinaOpen && (
                                    <div style={{ background: '#fafafa', paddingBottom: '4px' }}>
                                      {/* Option Todos os dias */}
                                      <div
                                        onClick={() => selectUsinaCampanha(u.nome, null)}
                                        style={{
                                          padding: '6px 16px 6px 68px', cursor: 'pointer',
                                          fontSize: 11, color: usinaAtual === u.nome && campanhaAtual === null ? '#059669' : '#64748b',
                                          fontWeight: usinaAtual === u.nome && campanhaAtual === null ? 600 : 400,
                                          background: usinaAtual === u.nome && campanhaAtual === null ? '#ecfdf5' : 'transparent'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = usinaAtual === u.nome && campanhaAtual === null ? '#ecfdf5' : '#f1f5f9'}
                                        onMouseLeave={e => e.currentTarget.style.background = usinaAtual === u.nome && campanhaAtual === null ? '#ecfdf5' : 'transparent'}
                                      >
                                        Todos os dias
                                      </div>
                                      
                                      {/* Campanhas */}
                                      {Object.keys(campanhas).map(campanhaNome => (
                                        <div
                                          key={campanhaNome}
                                          onClick={() => selectUsinaCampanha(u.nome, campanhaNome)}
                                          style={{
                                            padding: '6px 16px 6px 68px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            fontSize: 11, color: usinaAtual === u.nome && campanhaAtual === campanhaNome ? '#d97706' : '#64748b',
                                            fontWeight: usinaAtual === u.nome && campanhaAtual === campanhaNome ? 600 : 400,
                                            background: usinaAtual === u.nome && campanhaAtual === campanhaNome ? '#fffbeb' : 'transparent'
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.background = usinaAtual === u.nome && campanhaAtual === campanhaNome ? '#fffbeb' : '#f1f5f9'}
                                          onMouseLeave={e => e.currentTarget.style.background = usinaAtual === u.nome && campanhaAtual === campanhaNome ? '#fffbeb' : 'transparent'}
                                        >
                                          <span>🎯 {campanhaNome} ({campanhas[campanhaNome].length} d)</span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (window.confirm(`Excluir a campanha ${campanhaNome}?`)) {
                                                import('../services/api').then(({ deleteCampanha }) => {
                                                  deleteCampanha(u.nome, campanhaNome).then(() => {
                                                    setTodasCampanhas(prev => ({
                                                      ...prev,
                                                      [u.nome]: Object.fromEntries(Object.entries(prev[u.nome]).filter(([k]) => k !== campanhaNome))
                                                    }));
                                                    if (usinaAtual === u.nome && campanhaAtual === campanhaNome) {
                                                      setCampanhaAtual(null);
                                                    }
                                                  });
                                                });
                                              }
                                            }}
                                            style={{
                                              background: 'none', border: 'none', cursor: 'pointer',
                                              color: '#ef4444', fontSize: 12, padding: '2px 4px', borderRadius: 4
                                            }}
                                            title="Excluir campanha"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
