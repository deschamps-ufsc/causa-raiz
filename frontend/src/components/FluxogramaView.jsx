import React, { useState, useEffect } from 'react'
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
import { fetchMappingData } from '../services/api'

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
        ...baseNodeStyle, padding: '10px 20px', borderRadius: '4px', position: 'relative',
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
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
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

const nodeTypes = {
  box: BoxNode,
  circle: CircleNode,
  diamond: DiamondNode,
  chart: ChartNode
}

// ── INITIAL DATA ─────────────────────────────────────────────────────────

const initialNodes = [
  { id: 'gpoa', type: 'box', position: { x: 50, y: 50 }, data: { label: 'Gpoa', color: 'yellow', aggregator: true } },
  { id: 'grear', type: 'box', position: { x: 50, y: 110 }, data: { label: 'Grear', color: 'yellow', aggregator: true } },
  { id: 'tamb', type: 'box', position: { x: 50, y: 170 }, data: { label: 'Tamb', color: 'yellow', aggregator: true } },
  { id: 'tmod', type: 'box', position: { x: 50, y: 230 }, data: { label: 'Tmod', color: 'yellow', aggregator: true } },
  { id: 'sujidade', type: 'box', position: { x: 50, y: 290 }, data: { label: 'Sujidade', color: 'yellow', aggregator: true } },
  { id: 'energia', type: 'box', position: { x: 50, y: 350 }, data: { label: 'Energia Medida', color: 'green', aggregator: true } },
]

const initialEdges = []

// ── COMPONENT ─────────────────────────────────────────────────────────

export default function FluxogramaView({ elementos = [] }) {
  const { usinaAtual } = useUsina()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [inputsList, setInputsList] = useState([''])
  const [allSeries, setAllSeries] = useState([])

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
          estacao: meta.estacao || '',
        }))
        setAllSeries(arr)
      })
      .catch(console.error)
  }, [usinaAtual])

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-secondary)', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          if (node.data?.aggregator) {
            setSelectedBlock(node.data)
            setInputsList([''])
          }
        }}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 50, y: 80, zoom: 1 }}
        attributionPosition="bottom-right"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnDrag={false}
        zoomOnDoubleClick={false}
        zoomOnPinch={false}
      >
        <Background color="#ccc" gap={16} />
      </ReactFlow>

      {/* Modal Mockup */}
      {selectedBlock && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} 
            onClick={() => setSelectedBlock(null)} 
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', zIndex: 1001,
            width: '450px', maxWidth: '90vw', minHeight: '500px', maxHeight: '90vh', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              Bloco Agregador - {selectedBlock.label}
            </h3>
            
            <div style={{ margin: '20px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Selecione as séries de entrada: (Disponíveis: {allSeries?.length || 0})
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '2px', overflowY: 'visible', zIndex: 10 }}>
                {inputsList.map((val, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '11px', color: 'var(--text-muted)', width: '16px', textAlign: 'right' }}>{idx + 1}.</div>
                    <div style={{ flex: 1 }}>
                      <SingleSeriesDropdown 
                        value={val} 
                        onChange={(newVal) => {
                          const newList = [...inputsList]
                          newList[idx] = newVal
                          setInputsList(newList)
                        }}
                        series={allSeries}
                        elementos={elementos}
                      />
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
                onClick={() => setInputsList([...inputsList, ''])}
                style={{ marginTop: '12px', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-primary)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', width: '100%' }}
              >
                + Adicionar outra entrada
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setSelectedBlock(null)} 
                className="btn btn-ghost btn-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={() => setSelectedBlock(null)} 
                className="btn btn-primary btn-sm"
              >
                Salvar Configuração
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
