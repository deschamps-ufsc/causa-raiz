import React, { useState, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import SingleSeriesDropdown from './SingleSeriesDropdown'
import { useUsina } from '../hooks/UsinaContext'
import { fetchMappingData, fetchFlowConfig, saveFlowConfig, runFlow, fetchFlowIntegrals } from '../services/api'
import { useChartSettings } from '../hooks/ChartSettingsContext'

// ── CUSTOM NODES ─────────────────────────────────────────────────────────

const baseNodeStyle = {
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  fontSize: '12px',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
}

const BoxNode = ({ data }) => {
  const isAggregator = data.aggregator
  const bgColor = data.color === 'yellow' ? '#fef08a' : data.color === 'green' ? '#bbf7d0' : 'var(--bg-card)'
  const textColor = data.color ? '#334155' : 'var(--text-primary)'
  const borderColor = data.color === 'yellow' ? '#facc15' : data.color === 'green' ? '#4ade80' : 'var(--border)'

  return (
    <div 
      style={{ 
        ...baseNodeStyle, padding: '0 8px', borderRadius: '4px', position: 'relative',
        width: '100px', height: '40px', fontSize: '14px', boxSizing: 'border-box',
        background: bgColor, color: textColor, borderColor: borderColor,
        cursor: isAggregator ? 'pointer' : 'default',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: isAggregator ? '0 4px 6px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => isAggregator && (e.currentTarget.style.transform = 'scale(1.05)')}
      onMouseLeave={e => isAggregator && (e.currentTarget.style.transform = 'scale(1)')}
    >
      {!isAggregator && <Handle type="target" position={Position.Left} style={{ background: '#555' }} />}
      <div style={{ textDecoration: data.strike ? 'line-through' : 'none' }}>
        <span dangerouslySetInnerHTML={{ __html: data.label }} />
      </div>
      {data.hasMultipleOutputs ? (
        <>
          <Handle type="source" position={Position.Right} id="out-a" style={{ background: '#555', top: '25%' }} />
          <Handle type="source" position={Position.Right} id="out-b" style={{ background: '#555', top: '75%' }} />
        </>
      ) : (
        <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
      )}
    </div>
  )
}

const CircleNode = ({ data }) => {
  return (
    <div style={{ ...baseNodeStyle, width: '60px', height: '60px', borderRadius: '50%', textAlign: 'center', padding: '5px', fontSize: '10px', whiteSpace: 'pre-wrap' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      {data.label}
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
    </div>
  )
}

const DiamondNode = ({ data }) => {
  return (
    <div style={{ position: 'relative', width: '40px', height: '40px' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#555', left: '-5px', zIndex: 10 }} />
      <div style={{
        ...baseNodeStyle,
        width: '100%', height: '100%',
        transform: 'rotate(45deg)',
        borderRadius: '2px',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 'bold', fontSize: '12px', zIndex: 5, color: 'var(--text-primary)'
      }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#555', right: '-5px', zIndex: 10 }} />
    </div>
  )
}

const ChartNode = ({ data }) => {
  return (
    <div style={{ ...baseNodeStyle, width: '200px', height: '150px', borderRadius: '8px', padding: '10px', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Gráfico (Placeholder)</div>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M 0 100 Q 20 20 50 10 T 100 90" fill="none" stroke="#3b82f6" strokeWidth="2" />
        <path d="M 0 100 Q 30 50 40 30 T 100 80" fill="none" stroke="#10b981" strokeWidth="2" />
        <path d="M 0 100 Q 10 70 60 40 T 100 70" fill="none" stroke="#8b5cf6" strokeWidth="2" />
        <line x1="0" y1="95" x2="100" y2="95" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="5" y1="0" x2="5" y2="100" stroke="#cbd5e1" strokeWidth="1" />
      </svg>
    </div>
  )
}

const GeffNode = ({ data }) => (
  <div style={{
    padding: '8px', borderRadius: '10px', background: '#ffedd5',
    border: '2px solid #f97316', color: '#334155',
    width: '100px', height: '80px', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    textAlign: 'center', boxShadow: '0 6px 15px rgba(0,0,0,0.3)',
    position: 'relative', cursor: 'pointer', transition: 'all 0.2s'
  }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
    <div style={{ fontSize: '16px', fontWeight: 700, color: '#000000' }}>G<sub>eff</sub></div>
    <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', lineHeight: '1.2', fontWeight: 600 }}>
      β={(data.beta || 0).toFixed(2)}<br/>
      SSF={(data.SSF * 100 || 0).toFixed(1)}%<br/>
      MLF={(data.MLF * 100 || 0).toFixed(1)}%
    </div>
    <Handle type="target" position={Position.Left} style={{ background: '#f97316' }} />
    <Handle type="source" position={Position.Right} style={{ background: '#f97316' }} />
  </div>
)

const TcelNode = ({ data }) => (
  <div style={{
    padding: '8px', borderRadius: '10px', background: '#ffedd5',
    border: '2px solid #f97316', color: '#334155',
    width: '100px', height: '80px', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    textAlign: 'center', boxShadow: '0 6px 15px rgba(0,0,0,0.3)',
    position: 'relative', cursor: 'pointer', transition: 'all 0.2s'
  }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
    <div style={{ fontSize: '16px', fontWeight: 700, color: '#000000' }}>T<sub>cel</sub></div>
    <div style={{ fontSize: '9px', color: '#475569', marginTop: '4px', lineHeight: '1.2', fontWeight: 600 }}>
      G<sub>stc</sub>=1000<br/>
      dT<sub>cond</sub>=3°C
    </div>
    <Handle type="target" position={Position.Left} style={{ background: '#f97316' }} />
    <Handle type="source" position={Position.Right} style={{ background: '#f97316' }} />
  </div>
)

const nodeTypes = {
  default: BoxNode,
  box: BoxNode,
  circle: CircleNode,
  diamond: DiamondNode,
  chart: ChartNode,
  geff: GeffNode,
  tcel: TcelNode
}

// ── INITIAL DATA ─────────────────────────────────────────────────────────

const initialNodes = [
  { id: 'gpoa', type: 'box', position: { x: 30, y: 20 }, data: { label: 'G<sub>poa</sub>', color: 'yellow', aggregator: true, inputs: [], operation: 'sum', hasMultipleOutputs: true } },
  { id: 'grear', type: 'box', position: { x: 30, y: 120 }, data: { label: 'G<sub>rear</sub>', color: 'yellow', aggregator: true, inputs: [], operation: 'sum' } },
  { id: 'tamb', type: 'box', position: { x: 30, y: 220 }, data: { label: 'T<sub>amb</sub>', color: 'yellow', aggregator: true, inputs: [], operation: 'sum' } },
  { id: 'tmod', type: 'box', position: { x: 30, y: 320 }, data: { label: 'T<sub>mod</sub>', color: 'yellow', aggregator: true, inputs: [], operation: 'sum' } },
  { id: 'sujidade', type: 'box', position: { x: 30, y: 420 }, data: { label: 'Sujidade', color: 'yellow', aggregator: true, inputs: [], operation: 'sum' } },
  { id: 'geff', type: 'geff', position: { x: 240, y: 30 }, data: { label: 'Geff', beta: 1.0, SSF: 0.05, MLF: 0.02 } },
  { id: 'tcel', type: 'tcel', position: { x: 200, y: 300 }, data: { label: 'Tcel' } }
]

const initialEdges = [
  { id: 'e-gpoa-geff', source: 'gpoa', sourceHandle: 'out-a', target: 'geff', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-grear-geff', source: 'grear', target: 'geff', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-tmod-tcel', source: 'tmod', target: 'tcel', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-gpoa-tcel', source: 'gpoa', sourceHandle: 'out-b', target: 'tcel', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
]

// ── COMPONENT ─────────────────────────────────────────────────────────

export default function FluxogramaView({ elementos = [], showTitle = true }) {
  const { usinaAtual } = useUsina()
  const { filterSettings } = useChartSettings()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const selectedBlock = useMemo(() => nodes.find(n => n.id === selectedNodeId)?.data, [nodes, selectedNodeId])
  const [inputsList, setInputsList] = useState([{ series: '', filter: '' }])
  const [operation, setOperation] = useState('sum')
  const [outputFilter, setOutputFilter] = useState('')
  const [geffParams, setGeffParams] = useState({ beta: 1, SSF: 0, MLF: 0 })
  const [allSeries, setAllSeries] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState(null)

  // Estados para Tabela de Integrais Diárias
  const [integralsData, setIntegralsData] = useState({ columns: [], rows: [] })
  const [isLoadingIntegrals, setIsLoadingIntegrals] = useState(false)
  const [integralsError, setIntegralsError] = useState(null)
  const [showInputs, setShowInputs] = useState(true)
  const [visibleVars, setVisibleVars] = useState({
    gpoa: true,
    grear: true,
    geff: true,
    tamb: true,
    tmod: true,
    tcel: true,
    sujidade: true,
    energia: true
  })

  const loadIntegrals = (usina) => {
    if (!usina) return
    setIsLoadingIntegrals(true)
    setIntegralsError(null)
    fetchFlowIntegrals(usina)
      .then(res => {
        setIntegralsData(res || { columns: [], rows: [] })
      })
      .catch(err => {
        console.error("Erro ao carregar integrais:", err)
        setIntegralsError(err.message || "Erro ao carregar dados de integrais.")
      })
      .finally(() => {
        setIsLoadingIntegrals(false)
      })
  }

  useEffect(() => {
    if (usinaAtual) {
      loadIntegrals(usinaAtual)
    } else {
      setIntegralsData({ columns: [], rows: [] })
    }
  }, [usinaAtual])

  const canvasHeight = useMemo(() => {
    if (!nodes || nodes.length === 0) return 400
    let maxBottom = 0
    nodes.forEach(n => {
      const nodeY = n.position?.y || 0
      const nodeHeight = n.type === 'geff' || n.type === 'tcel' ? 80 : 46
      const bottom = nodeY + nodeHeight
      if (bottom > maxBottom) {
        maxBottom = bottom
      }
    })
    return Math.max(300, maxBottom + 20)
  }, [nodes])

  const totalsRow = useMemo(() => {
    if (!integralsData.rows || integralsData.rows.length === 0 || !integralsData.columns) return null
    const totals = { date: 'Total' }
    integralsData.columns.forEach(col => {
      const isAverageCol = col.key.toLowerCase().startsWith('tamb') || 
                           col.key.toLowerCase().startsWith('tmod') || 
                           col.key.toLowerCase().startsWith('tcel') ||
                           col.key.toLowerCase().startsWith('sujidade');
      let sum = 0
      let count = 0
      let hasNumber = false
      integralsData.rows.forEach(row => {
        const val = row[col.key]
        if (typeof val === 'number') {
          sum += val
          count++
          hasNumber = true
        }
      })
      if (hasNumber) {
        totals[col.key] = isAverageCol ? (sum / count) : sum
      } else {
        totals[col.key] = '-'
      }
    })
    return totals
  }, [integralsData])

  const visibleColumns = useMemo(() => {
    if (!integralsData.columns) return []
    return integralsData.columns.filter(col => {
      // 1. Filtro de Exibir Entradas
      const isOutput = !col.label.includes('Entrada');
      if (!isOutput && !showInputs) return false;

      // 2. Filtro de Variáveis Habilitadas
      const colKey = col.key.toLowerCase();
      if (colKey.startsWith('gpoa') && !visibleVars.gpoa) return false;
      if (colKey.startsWith('grear') && !visibleVars.grear) return false;
      if (colKey.startsWith('geff') && !visibleVars.geff) return false;
      if (colKey.startsWith('tamb') && !visibleVars.tamb) return false;
      if (colKey.startsWith('tmod') && !visibleVars.tmod) return false;
      if (colKey.startsWith('tcel') && !visibleVars.tcel) return false;
      if (colKey.startsWith('sujidade') && !visibleVars.sujidade) return false;
      if (colKey.startsWith('energia') && !visibleVars.energia) return false;

      return true;
    });
  }, [integralsData.columns, showInputs, visibleVars]);

  const headerGroups = useMemo(() => {
    const groups = [];
    let currentGroup = null;
    
    visibleColumns.forEach((col) => {
      if (col.type === 'input') {
        if (currentGroup && currentGroup.type === 'input' && currentGroup.node_id === col.node_id) {
          currentGroup.columns.push(col);
        } else {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = {
            type: 'input',
            node_id: col.node_id,
            columns: [col]
          };
        }
      } else {
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({
          type: col.type,
          node_id: col.node_id,
          columns: [col]
        });
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [visibleColumns]);

  useEffect(() => {
    if (!usinaAtual) return
    fetchMappingData(usinaAtual)
      .then(mapping => {
        const arr = Object.entries(mapping || {}).map(([col, meta]) => ({
          coluna: col,
          elemento: meta.elemento || '',
          skid: meta.skid || '',
          inversor: meta.inversor || '',
          stringbox: meta.stringbox || '',
          string: meta.string || '',
          estacao: meta.estacao || '',
        }))
        
        // Adiciona as saídas dos agregadores como séries selecionáveis
        const aggSeries = nodes
          .filter(n => n.data?.aggregator)
          .map(n => ({
            coluna: `agg_${n.id}`,
            elemento: 'Agregado',
            isAggregator: true
          }))

        setAllSeries([...arr, ...aggSeries])
      })
      .catch(console.error)
  }, [usinaAtual, nodes])

  useEffect(() => {
    if (!usinaAtual) {
      setNodes(initialNodes)
      setEdges(initialEdges)
      return
    }
    fetchFlowConfig(usinaAtual)
      .then(config => {
        if (config && config.nodes) {
          setNodes(nds => {
            // 1. Pegar todos os nós salvos
            const savedNodes = config.nodes.map(sn => {
              const initial = nds.find(i => i.id === sn.id)
              return { 
                ...sn, 
                // Forçar posição do Geff para garantir alinhamento central
                position: sn.id === 'geff' ? (initial?.position || sn.position) : sn.position,
                type: sn.type || (initial?.type || 'box'),
                data: { 
                  ...(initial?.data || {}), 
                  ...sn.data,
                  // Garantir que o label com subscritos (<sub>) do código tenha prioridade
                  label: initial?.data?.label || sn.data.label 
                }
              }
            })
            
            // 2. Garantir que nós iniciais obrigatórios (como geff) existam
            const finalNodes = [...savedNodes]
            nds.forEach(initial => {
              if (!finalNodes.find(f => f.id === initial.id)) {
                finalNodes.push(initial)
              }
            })
            return finalNodes
          })
          if (config.edges) {
            setEdges(eds => {
              // Forçar smoothstep em todas as arestas carregadas
              const finalEdges = config.edges.map(e => ({ ...e, type: 'smoothstep' }))
              initialEdges.forEach(ie => {
                if (!finalEdges.find(f => f.id === ie.id)) {
                  finalEdges.push(ie)
                }
              })
              return finalEdges
            })
          }
        } else {
          setNodes(initialNodes)
          setEdges(initialEdges)
        }
      })
      .catch(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
      })
  }, [usinaAtual, setNodes, setEdges])

  const handleRunFlow = async () => {
    if (!usinaAtual) return
    try {
      setIsProcessing(true)
      const res = await runFlow(usinaAtual)
      setToast({
        title: 'Processamento Concluído',
        message: `Foram processados com sucesso ${res.processed_days} dias de dados.`,
        type: 'success'
      })
      setTimeout(() => {
        setToast(current => current?.title === 'Processamento Concluído' ? null : current)
      }, 5000)
      loadIntegrals(usinaAtual)
    } catch (err) {
      setToast({
        title: 'Erro no Processamento',
        message: err.message,
        type: 'error'
      })
      setTimeout(() => {
        setToast(current => current?.title === 'Erro no Processamento' ? null : current)
      }, 6000)
    } finally {
      setIsProcessing(false)
    }
  }

  const getColumnTheme = (col) => {
    const key = col.key.toLowerCase();
    if (key.startsWith('gpoa') || key.startsWith('grear') || key.startsWith('tamb') || key.startsWith('tmod') || key.startsWith('sujidade')) {
      return {
        color: '#eab308', // Amarelo
        bgHeader: 'rgba(234, 179, 8, 0.05)',
        bgCell: 'rgba(234, 179, 8, 0.02)',
        bgTotal: 'rgba(234, 179, 8, 0.08)'
      };
    } else if (key === 'geff' || key === 'tcel') {
      return {
        color: '#f97316', // Laranja
        bgHeader: 'rgba(249, 115, 22, 0.05)',
        bgCell: 'rgba(249, 115, 22, 0.02)',
        bgTotal: 'rgba(249, 115, 22, 0.08)'
      };
    } else if (key.startsWith('energia')) {
      return {
        color: '#10b981', // Verde
        bgHeader: 'rgba(16, 185, 129, 0.05)',
        bgCell: 'rgba(16, 185, 129, 0.02)',
        bgTotal: 'rgba(16, 185, 129, 0.08)'
      };
    }
    return {
      color: 'var(--text-primary)',
      bgHeader: 'var(--bg-secondary)',
      bgCell: 'transparent',
      bgTotal: 'transparent'
    };
  };

  const formatColumnLabel = (label) => {
    if (!label) return '';
    const replacements = [
      { key: 'Gpoa', base: 'G', sub: 'poa' },
      { key: 'Grear', base: 'G', sub: 'rear' },
      { key: 'Geff', base: 'G', sub: 'eff' },
      { key: 'Tamb', base: 'T', sub: 'amb' },
      { key: 'Tmod', base: 'T', sub: 'mod' },
      { key: 'Tcel', base: 'T', sub: 'cel' }
    ];
    for (const rep of replacements) {
      if (label.startsWith(rep.key)) {
        const rest = label.slice(rep.key.length);
        return <>{rep.base}<sub>{rep.sub}</sub>{rest}</>;
      }
    }
    return label;
  };

  const formatGroupHeaderLabel = (nodeId) => {
    switch (nodeId.toLowerCase()) {
      case 'gpoa':
        return <span>G<sub>poa</sub> - Entradas</span>;
      case 'grear':
        return <span>G<sub>rear</sub> - Entradas</span>;
      case 'geff':
        return <span>G<sub>eff</sub> - Entradas</span>;
      case 'tamb':
        return <span>T<sub>amb</sub> - Entradas</span>;
      case 'tmod':
        return <span>T<sub>mod</sub> - Entradas</span>;
      case 'tcel':
        return <span>T<sub>cel</sub> - Entradas</span>;
      case 'sujidade':
        return <span>Sujidade - Entradas</span>;
      case 'energia':
        return <span>Energia - Entradas</span>;
      default:
        return <span>{nodeId} - Entradas</span>;
    }
  };

  const getAggregatorDescription = (nodeId) => {
    switch (nodeId) {
      case 'gpoa':
        return <>G<sub>poa</sub> - Irradiância Global no Plano Inclinado</>;
      case 'grear':
        return <>G<sub>rear</sub> - Irradiância Traseira no Plano Inclinado</>;
      case 'tamb':
        return <>T<sub>amb</sub> - Temperatura Ambiente</>;
      case 'tmod':
        return <>T<sub>mod</sub> - Temperatura dos Módulos</>;
      case 'sujidade':
        return <>Sujidade - Fator de Sujidade</>;
      case 'energia':
        return <>Energia - Geração de Energia</>;
      default:
        return nodeId;
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      width: '100%', 
      gap: '20px', 
      padding: showTitle ? '16px' : '0 0 16px 0', 
      background: showTitle ? 'var(--bg-secondary)' : 'transparent', 
      boxSizing: 'border-box' 
    }}>
      
      {/* Título Principal da Aba */}
      {showTitle && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '4px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 EPI - Energy Performance Index
          </h2>
        </div>
      )}

      {/* ── SEÇÃO DO FLUXOGRAMA ── */}
      <div style={{ 
        width: '100%', 
        background: 'var(--bg-card)', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        padding: '24px', 
        boxSizing: 'border-box', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔀 Fluxograma
            </h3>
          </div>
          <button
            onClick={handleRunFlow}
            disabled={isProcessing || !usinaAtual}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: 'none',
              background: isProcessing ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b, #f97316)',
              color: '#fff', fontSize: '13px', fontWeight: '700', cursor: isProcessing ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 8
            }}
            onMouseEnter={e => !isProcessing && (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => !isProcessing && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {isProcessing ? '⚙️ Processando...' : '🚀 Processar Fluxograma'}
          </button>
        </div>

        <div style={{ width: '100%', height: `${canvasHeight}px`, position: 'relative', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: '8px', transition: 'height 0.3s ease' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            proOptions={{ hideAttribution: true }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id)
              if (node.type === 'geff') {
                setGeffParams({
                  beta: node.data.beta || 0,
                  SSF: node.data.SSF || 0,
                  MLF: node.data.MLF || 0
                })
              } else if (node.data?.aggregator) {
                const rawInputs = node.data.inputs || ['']
                const normalized = rawInputs.map(item => 
                  typeof item === 'string' ? { series: item, filter: '' } : item
                )
                setInputsList(normalized)
                setOperation(node.data.operation || 'sum')
                setOutputFilter(node.data.outputFilter || '')
              }
            }}
            nodeTypes={nodeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            attributionPosition="bottom-right"
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            preventScrolling={false}
            panOnDrag={false}
            zoomOnDoubleClick={false}
            zoomOnPinch={false}
          >
            <Background color="#ccc" gap={16} />
          </ReactFlow>
        </div>
      </div>

      {/* Modal Bloco Agregador */}
      {selectedBlock && selectedBlock.aggregator && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} 
            onClick={() => setSelectedNodeId(null)} 
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', zIndex: 1001,
            width: '600px', maxWidth: '90vw', minHeight: '500px', maxHeight: '90vh', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              {getAggregatorDescription(selectedNodeId)}
            </h3>
            
            <div style={{ margin: '20px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Selecione as séries de entrada: (Disponíveis: {allSeries?.length || 0})
              </p>

              {/* Toggle de Operação e Filtro de Saída Final */}
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Operação:</span>
                  <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 4 }}>
                    <button
                      onClick={() => setOperation('sum')}
                      style={{
                        padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.2s',
                        background: operation === 'sum' ? 'var(--amber)' : 'transparent',
                        color: operation === 'sum' ? '#000' : 'var(--text-muted)'
                      }}
                    >SOMA</button>
                    <button
                      onClick={() => setOperation('mean')}
                      style={{
                        padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.2s',
                        background: operation === 'mean' ? 'var(--amber)' : 'transparent',
                        color: operation === 'mean' ? '#000' : 'var(--text-muted)'
                      }}
                    >MÉDIA</button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Filtro de Saída:</span>
                  <select
                    value={outputFilter || ''}
                    onChange={(e) => setOutputFilter(e.target.value)}
                    style={{
                      width: '200px', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border)',
                      fontSize: '12px', background: 'var(--bg-card)', color: 'var(--text-primary)',
                      outline: 'none', cursor: 'pointer'
                    }}
                  >
                    <option value="">Sem filtro</option>
                    {filterSettings.map(f => (
                      <option key={f.name} value={f.name}>{f.name} ({f.element})</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '2px', overflowY: 'visible', zIndex: 10 }}>
                {inputsList.map((val, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '11px', color: 'var(--text-muted)', width: '16px', textAlign: 'right' }}>{idx + 1}.</div>
                    <div style={{ flex: 3 }}>
                      <SingleSeriesDropdown 
                        value={val.series} 
                        onChange={(newVal) => {
                          const newList = [...inputsList]
                          newList[idx] = { ...newList[idx], series: newVal }
                          setInputsList(newList)
                        }}
                        series={allSeries}
                        elementos={elementos}
                      />
                    </div>
                    <div style={{ flex: 2 }}>
                      {(() => {
                        const seriesInfo = allSeries.find(s => s.coluna === val.series);
                        const element = seriesInfo?.elemento || '';
                        const applicableFilters = filterSettings.filter(f => f.element === element);
                        
                        return (
                          <select
                            value={val.filter || ''}
                            onChange={(e) => {
                              const newList = [...inputsList]
                              newList[idx] = { ...newList[idx], filter: e.target.value }
                              setInputsList(newList)
                            }}
                            disabled={!val.series}
                            style={{
                              width: '100%', padding: '9px 10px', borderRadius: '4px', border: '1px solid var(--border)',
                              fontSize: '12px', background: !val.series ? '#f1f5f9' : 'var(--bg-card)', 
                              color: 'var(--text-primary)',
                              outline: 'none', appearance: 'none', cursor: !val.series ? 'not-allowed' : 'pointer',
                              opacity: !val.series ? 0.6 : 1
                            }}
                          >
                            {!val.series ? (
                              <option value="">Selecione uma série...</option>
                            ) : (
                              <>
                                <option value="">Sem filtro</option>
                                {applicableFilters.map(f => (
                                  <option key={f.name} value={f.name}>{f.name}</option>
                                ))}
                                {applicableFilters.length === 0 && (
                                  <option value="" disabled>Nenhum filtro para {element}</option>
                                )}
                              </>
                            )}
                          </select>
                        );
                      })()}
                    </div>
                    <div style={{ width: '20px' }}>
                      {inputsList.length > 1 && (
                        <button onClick={() => {
                          const newList = [...inputsList]
                          newList.splice(idx, 1)
                          setInputsList(newList)
                        }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px', fontSize: '14px' }} title="Remover entrada">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setInputsList([...inputsList, { series: '', filter: '' }])}
                style={{ marginTop: '12px', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-primary)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', width: '100%' }}
              >
                + Adicionar outra entrada
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setSelectedNodeId(null)} 
                className="btn btn-ghost btn-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const updatedNodes = nodes.map(n => {
                    if (n.id === selectedNodeId) {
                      return { ...n, data: { ...n.data, inputs: inputsList, operation: operation, outputFilter: outputFilter } }
                    }
                    return n
                  })
                  setNodes(updatedNodes)
                  if (usinaAtual) {
                    saveFlowConfig(usinaAtual, {
                      nodes: updatedNodes.map(n => ({ id: n.id, data: n.data, position: n.position, type: n.type })),
                      edges: edges
                    })
                  }
                  setSelectedNodeId(null)
                }} 
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--amber)', color: '#000' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal Bloco Geff */}
      {selectedBlock && nodes.find(n => n.id === selectedNodeId)?.type === 'geff' && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} 
            onClick={() => setSelectedNodeId(null)} 
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', zIndex: 1001,
            width: '450px', maxWidth: '90vw', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ marginTop: 0, color: '#f97316', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              G<sub>eff</sub> - Irradiância Efetiva
            </h3>
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(249,115,22,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #f97316' }}>
                Este bloco calcula a irradiância efetiva usando as saídas de <strong>Gpoa</strong> e <strong>Grear</strong>.<br/>
                <code style={{ display: 'block', marginTop: 8, fontSize: 12 }}>G<sub>eff</sub> = Gpoa + β * Grear * (1 - SSF) * (1 - MLF)</code>
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>β: Fator de Bifacialidade do módulo fotovoltaico:</label>
                  <input 
                    type="number" step="0.01" className="input" 
                    style={{ width: 100 }} 
                    value={geffParams.beta} 
                    onChange={e => setGeffParams({ ...geffParams, beta: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>SSF: Structure Shading Factor (%):</label>
                  <div style={{ position: 'relative', width: 100 }}>
                    <input 
                      type="number" step="0.1" className="input" 
                      style={{ width: '100%', paddingRight: '20px' }} 
                      value={Math.round(geffParams.SSF * 1000) / 10} 
                      onChange={e => setGeffParams({ ...geffParams, SSF: (parseFloat(e.target.value) || 0) / 100 })}
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--text-muted)' }}>%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>MLF: Mismatch Loss Factor (%):</label>
                  <div style={{ position: 'relative', width: 100 }}>
                    <input 
                      type="number" step="0.1" className="input" 
                      style={{ width: '100%', paddingRight: '20px' }} 
                      value={Math.round(geffParams.MLF * 1000) / 10} 
                      onChange={e => setGeffParams({ ...geffParams, MLF: (parseFloat(e.target.value) || 0) / 100 })}
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--text-muted)' }}>%</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 20 }}>
              <button 
                onClick={() => setSelectedNodeId(null)} 
                className="btn btn-ghost btn-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const updatedNodes = nodes.map(n => {
                    if (n.id === selectedNodeId) {
                      return { ...n, data: { ...n.data, ...geffParams } }
                    }
                    return n
                  })
                  setNodes(updatedNodes)
                  if (usinaAtual) {
                    saveFlowConfig(usinaAtual, {
                      nodes: updatedNodes.map(n => ({ id: n.id, data: n.data, position: n.position, type: n.type })),
                      edges: edges
                    })
                  }
                  setSelectedNodeId(null)
                }} 
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--amber)', color: '#000' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal Bloco Tcel */}
      {selectedBlock && nodes.find(n => n.id === selectedNodeId)?.type === 'tcel' && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} 
            onClick={() => setSelectedNodeId(null)} 
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', zIndex: 1001,
            width: '450px', maxWidth: '90vw', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ marginTop: 0, color: '#f97316', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              T<sub>cel</sub> - Temperatura da Célula
            </h3>
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(249,115,22,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #f97316' }}>
                Este bloco calcula a temperatura operacional ajustada da célula usando as saídas de <strong>Tmod</strong> e <strong>Gpoa</strong>.<br/>
                <code style={{ display: 'block', marginTop: 8, fontSize: 13, fontWeight: 700 }}>T<sub>cell</sub> = T<sub>m</sub> + (G<sub>POA</sub> / G<sub>STC</sub>) * dT<sub>cond</sub></code>
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>T<sub>m</sub> (Temperatura do Módulo):</span>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Série vinda de <strong>Tmod</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>G<sub>POA</sub> (Irradiância no plano inclinado):</span>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Série vinda de <strong>Gpoa</strong></span>
                </div>
                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>G<sub>STC</sub> (Irradiância de Referência):</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>1000 W/m² (Fixo)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>dT<sub>cond</sub> (Coeficiente de Transf. Temp):</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>3 ºC (Fixo)</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: 20 }}>
              <button 
                onClick={() => setSelectedNodeId(null)} 
                className="btn btn-ghost btn-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SEÇÃO DA TABELA DE INTEGRAIS DIÁRIAS ── */}
      <div style={{ 
        width: '100%', 
        background: 'var(--bg-card)', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        padding: '24px', 
        boxSizing: 'border-box', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 Tabela de Dados
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              fontSize: '13px', cursor: 'pointer', userSelect: 'none', 
              color: 'var(--text-primary)', fontWeight: '600'
            }}>
              <input 
                type="checkbox" 
                checked={showInputs} 
                onChange={(e) => setShowInputs(e.target.checked)} 
                style={{ 
                  width: '16px', height: '16px', 
                  accentColor: 'var(--amber)', cursor: 'pointer'
                }} 
              />
              Exibir Entradas
            </label>

            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)' }} />

            <details style={{ position: 'relative', cursor: 'pointer' }}>
              <summary style={{ 
                fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600', 
                userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 
              }}>
                <span>⚙️ Variáveis</span>
                <span style={{ fontSize: '10px' }}>▼</span>
              </summary>
              <div style={{ 
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', 
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', 
                padding: '10px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, 
                display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '140px' 
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.gpoa} onChange={() => setVisibleVars(prev => ({ ...prev, gpoa: !prev.gpoa }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>G<sub>poa</sub></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.grear} onChange={() => setVisibleVars(prev => ({ ...prev, grear: !prev.grear }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>G<sub>rear</sub></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.geff} onChange={() => setVisibleVars(prev => ({ ...prev, geff: !prev.geff }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>G<sub>eff</sub></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.tamb} onChange={() => setVisibleVars(prev => ({ ...prev, tamb: !prev.tamb }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>T<sub>amb</sub></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.tmod} onChange={() => setVisibleVars(prev => ({ ...prev, tmod: !prev.tmod }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>T<sub>mod</sub></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.tcel} onChange={() => setVisibleVars(prev => ({ ...prev, tcel: !prev.tcel }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>T<sub>cel</sub></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.sujidade} onChange={() => setVisibleVars(prev => ({ ...prev, sujidade: !prev.sujidade }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Sujidade</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.energia} onChange={() => setVisibleVars(prev => ({ ...prev, energia: !prev.energia }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Energia</span>
                </label>
              </div>
            </details>

            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)' }} />

            <button
              onClick={() => loadIntegrals(usinaAtual)}
              disabled={isLoadingIntegrals || !usinaAtual}
              className="btn btn-ghost btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isLoadingIntegrals ? '🔄 Carregando...' : '🔁 Atualizar'}
            </button>
          </div>
        </div>

        {isLoadingIntegrals ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            🔄 Calculando integrais das séries... Por favor, aguarde.
          </div>
        ) : integralsError ? (
          <div style={{ padding: '24px', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--red)', borderRadius: '6px', color: 'var(--red)', fontSize: '13px' }}>
            ⚠️ {integralsError}
          </div>
        ) : !integralsData.rows || integralsData.rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
            📭 Nenhuma integral calculada. Por favor, certifique-se de processar o fluxograma primeiro para gerar os dados consolidados.
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                {/* LINHA 1 (Nível Superior) */}
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th 
                    rowSpan={2} 
                    style={{ 
                      padding: '12px 16px', 
                      fontWeight: '700', 
                      fontSize: '13px', 
                      color: 'var(--text-primary)', 
                      borderBottom: '2px solid var(--border)', 
                      textAlign: 'left',
                      position: 'sticky',
                      left: 0,
                      background: 'var(--bg-secondary)',
                      zIndex: 3,
                      boxShadow: '2px 0 5px rgba(0,0,0,0.05)',
                      verticalAlign: 'middle'
                    }}
                  >
                    Data
                  </th>
                  {headerGroups.map((group, gIdx) => {
                    const firstCol = group.columns[0];
                    const theme = getColumnTheme(firstCol);
                    
                    if (group.type === 'input') {
                      return (
                        <th 
                          key={`group-input-${group.node_id}-${gIdx}`}
                          colSpan={group.columns.length}
                          style={{
                            padding: '8px 12px',
                            fontWeight: '700',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                            borderBottom: '1px solid var(--border)',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            background: 'var(--bg-secondary)'
                          }}
                        >
                          {formatGroupHeaderLabel(group.node_id)}
                        </th>
                      );
                    } else {
                      // Output ou Special (spans across both rows)
                      const isStyled = group.type === 'output' || group.type === 'special';
                      return (
                        <th 
                          key={`group-single-${firstCol.key}`}
                          rowSpan={2}
                          style={{ 
                            padding: '12px 16px', 
                            fontWeight: '700', 
                            fontSize: '12px', 
                            color: isStyled ? theme.color : 'var(--text-primary)', 
                            borderBottom: '2px solid var(--border)', 
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            background: isStyled ? theme.bgHeader : 'var(--bg-secondary)',
                            verticalAlign: 'middle'
                          }}
                        >
                          {formatColumnLabel(firstCol.label)}
                        </th>
                      );
                    }
                  })}
                </tr>

                {/* LINHA 2 (Nível Inferior - apenas se houver inputs) */}
                {headerGroups.some(g => g.type === 'input') && (
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {headerGroups.filter(g => g.type === 'input').map(group => {
                      return group.columns.map((col, idx) => {
                        const theme = getColumnTheme(col);
                        // Extrair apenas o número da entrada (ex: "Gpoa - Entrada 2" -> "2")
                        const match = col.label.match(/Entrada\s+(\d+)/i);
                        const subLabel = match ? match[1] : (idx + 1).toString();
                        
                        return (
                          <th 
                            key={`sub-input-${col.key}`}
                            style={{ 
                              padding: '6px 12px', 
                              fontWeight: '700', 
                              fontSize: '11px', 
                              color: 'var(--text-secondary)', 
                              borderBottom: '2px solid var(--border)', 
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              background: 'var(--bg-secondary)'
                            }}
                          >
                            {subLabel}
                          </th>
                        );
                      });
                    })}
                  </tr>
                )}
              </thead>
              <tbody>
                {integralsData.rows.map((row, idx) => (
                  <tr 
                    key={row.date} 
                    style={{ 
                      background: idx % 2 === 0 ? 'var(--bg-card)' : 'rgba(0,0,0,0.01)',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-card)' : 'rgba(0,0,0,0.01)'}
                  >
                    <td style={{ 
                      padding: '10px 16px', 
                      fontWeight: '600', 
                      color: 'var(--text-primary)', 
                      borderBottom: '1px solid var(--border)', 
                      textAlign: 'left',
                      position: 'sticky',
                      left: 0,
                      background: 'var(--bg-card)',
                      zIndex: 1,
                      boxShadow: '2px 0 5px rgba(0,0,0,0.05)'
                    }}>
                      {row.date}
                    </td>
                    {visibleColumns.map(col => {
                      const theme = getColumnTheme(col);
                      const isOutput = !col.label.includes('Entrada');
                      const val = row[col.key];
                      const formattedVal = typeof val === 'number' 
                        ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                        : val;
                      return (
                        <td 
                          key={col.key} 
                          style={{ 
                            padding: '10px 16px', 
                            borderBottom: '1px solid var(--border)', 
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            color: isOutput ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: isOutput ? '600' : 'normal',
                            background: isOutput ? theme.bgCell : 'transparent'
                          }}
                        >
                          {formattedVal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {totalsRow && (
                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 'bold', borderTop: '2px double var(--border)' }}>
                    <td style={{ 
                      padding: '12px 16px', 
                      fontWeight: '700', 
                      color: 'var(--text-primary)', 
                      textAlign: 'left',
                      position: 'sticky',
                      left: 0,
                      background: 'var(--bg-secondary)',
                      zIndex: 1,
                      boxShadow: '2px 0 5px rgba(0,0,0,0.05)',
                      borderTop: '2px double var(--border)'
                    }}>
                      {totalsRow.date}
                    </td>
                    {visibleColumns.map(col => {
                      const theme = getColumnTheme(col);
                      const isOutput = !col.label.includes('Entrada');
                      const val = totalsRow[col.key];
                      const formattedVal = typeof val === 'number' 
                        ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                        : val;
                      return (
                        <td 
                          key={col.key} 
                          style={{ 
                            padding: '12px 16px', 
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            color: isOutput ? theme.color : 'var(--text-primary)',
                            fontWeight: '700',
                            background: isOutput ? theme.bgTotal : 'transparent',
                            borderTop: '2px double var(--border)'
                          }}
                        >
                          {formattedVal}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <>
          <style>{`
            @keyframes slideIn {
              from { transform: translateX(120%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 99999,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderLeft: toast.type === 'success' ? '4px solid #10b981' : '4px solid #ef4444',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            maxWidth: '380px',
            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            boxSizing: 'border-box'
          }}>
            <div style={{ fontSize: '20px', lineHeight: '1' }}>
              {toast.type === 'success' ? '✅' : '❌'}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                {toast.title}
              </span>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-line', lineHeight: '1.4' }}>
                {toast.message}
              </p>
            </div>
            <button 
              onClick={() => setToast(null)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: '1',
                marginTop: '-2px'
              }}
            >
              ×
            </button>
          </div>
        </>
      )}
    </div>
  )
}
