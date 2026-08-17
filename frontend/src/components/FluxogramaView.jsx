import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  useNodes,
  useEdges,
  useUpdateNodeInternals,
  BaseEdge,
  getSmoothStepPath
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import SingleSeriesDropdown, { formatSeriesName } from './SingleSeriesDropdown'
import { useUsina } from '../hooks/UsinaContext'
import api, { fetchMappingData, fetchFlowConfig, saveFlowConfig, runFlow, checkFlowStatus, startFlowIntegrals, getFlowIntegralsStatus, fetchDetailedUsinas, fetchFluxogramaChart } from '../services/api'
import { useChartSettings } from '../hooks/ChartSettingsContext'
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf'
import PlotWrapper from 'react-plotly.js'
const Plot = PlotWrapper.default || PlotWrapper

const getFillData = (timestamps, values) => {
    if (!timestamps || !values) return { x: [], y: [] };
    const fillX = [];
    const fillY = [];
    let inBlock = false;
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const isValid = val !== null && val !== undefined && !Number.isNaN(val);
        if (isValid) {
            if (!inBlock) {
                fillX.push(timestamps[i]);
                fillY.push(0);
                inBlock = true;
            }
            fillX.push(timestamps[i]);
            fillY.push(val);
        } else {
            if (inBlock) {
                fillX.push(timestamps[i - 1]);
                fillY.push(0);
                inBlock = false;
            }
            fillX.push(timestamps[i]);
            fillY.push(null);
        }
    }
    if (inBlock && timestamps.length > 0) {
        fillX.push(timestamps[timestamps.length - 1]);
        fillY.push(0);
    }
    return { x: fillX, y: fillY };
};

// ── CUSTOM EDGES ─────────────────────────────────────────────────────────

const OffsetSmoothStepEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data
}) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    centerX: data?.centerX,
    centerY: data?.centerY,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
    </>
  );
};

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

const BoxNode = ({ id, data }) => {
  const isAggregator = data.aggregator
  const bgColor = data.color === 'yellow' ? '#fef08a' : data.color === 'green' ? '#bbf7d0' : data.color === 'purple' ? '#e9d5ff' : data.color === 'teal' ? '#bbdefb' : data.color === 'darkblue' ? '#bbdefb' : data.color === 'cyan' ? '#ccfbf1' : data.color === 'orange' ? '#ffedd5' : data.color === 'brown' ? '#d7ccc8' : data.color === 'gray' ? '#f1f5f9' : 'var(--bg-card)'
  const textColor = data.color ? '#334155' : 'var(--text-primary)'
  const borderColor = data.color === 'yellow' ? '#facc15' : data.color === 'green' ? '#4ade80' : data.color === 'purple' ? '#c084fc' : data.color === 'teal' ? '#0277BD' : data.color === 'darkblue' ? '#0277BD' : data.color === 'cyan' ? '#00838F' : data.color === 'orange' ? '#f97316' : data.color === 'brown' ? '#6d4c41' : data.color === 'gray' ? '#94a3b8' : 'var(--border)'

  const nodes = useNodes()
  const edges = useEdges()
  const updateNodeInternals = useUpdateNodeInternals()
  
  const isSimultaneidade = data.label && (data.label.includes('Simultaneidade') || data.label.includes('Dados Válidos'))
  
  let topVal = 20
  let bottomVal = 100
  
  if (isSimultaneidade) {
    const myNode = nodes.find(n => n.id === id)
    if (myNode) {
      const myEdges = edges.filter(e => e.target === id)
      const topEdge = myEdges.find(e => e.targetHandle === 'target-left-top')
      const bottomEdge = myEdges.find(e => e.targetHandle === 'target-left-bottom')
      
      const topNode = topEdge ? nodes.find(n => n.id === topEdge.source) : null
      const bottomNode = bottomEdge ? nodes.find(n => n.id === bottomEdge.source) : null
      
      const myY = myNode.position.y
      
      if (topNode) {
        const topH = topNode.data?.height ? parseInt(topNode.data.height) : (['tcel', 'geff'].includes(topNode.type) ? 80 : 40)
        topVal = topNode.position.y + (topH / 2) - myY
      }
      
      if (bottomNode) {
        const botH = bottomNode.data?.height ? parseInt(bottomNode.data.height) : (['tcel', 'geff'].includes(bottomNode.type) ? 80 : 40)
        bottomVal = bottomNode.position.y + (botH / 2) - myY
      }
    }
  }

  let customTargets = data.customTargets
  if (isSimultaneidade) {
    customTargets = [
      { id: 'target-top', position: Position.Top },
      { id: 'target-bottom-1', position: Position.Bottom, style: { left: '33%' } },
      { id: 'target-bottom-2', position: Position.Bottom, style: { left: '67%' } },
      { id: 'target-left-top', position: Position.Left, style: { top: `${topVal}px` } },
      { id: 'target-left-bottom', position: Position.Left, style: { top: `${bottomVal}px` } }
    ]
  }

  useEffect(() => {
    if (isSimultaneidade) {
      updateNodeInternals(id)
    }
  }, [topVal, bottomVal, id, isSimultaneidade, updateNodeInternals])

  const isClickable = isAggregator || isSimultaneidade

  return (
    <div 
      style={{ 
        ...baseNodeStyle, padding: '0 8px', borderRadius: '10px', position: 'relative',
        width: data.width || '100px', height: data.height || '40px', fontSize: '14px', boxSizing: 'border-box',
        background: bgColor, color: textColor, borderColor: borderColor,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: isClickable ? '0 4px 6px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => isClickable && (e.currentTarget.style.transform = 'scale(1.05)')}
      onMouseLeave={e => isClickable && (e.currentTarget.style.transform = 'scale(1)')}
    >
      {(!isAggregator || data.leftTarget) && (
        customTargets ? (
          customTargets.map(tgt => (
            <Handle
              key={tgt.id}
              type="target"
              position={tgt.position}
              id={tgt.id}
              style={{ background: '#555', ...tgt.style }}
            />
          ))
        ) : (
          <Handle type="target" position={Position.Left} id="target" style={{ background: '#555' }} />
        )
      )}
      <div style={{ textDecoration: data.strike ? 'line-through' : 'none', textAlign: 'center' }}>
        <span dangerouslySetInnerHTML={{ __html: data.label }} />
      </div>
      {data.hasMultipleOutputs ? (
        <>
          <Handle type="source" position={Position.Right} id="out-a" style={{ background: '#555', top: '25%' }} />
          <Handle type="source" position={Position.Right} id="out-b" style={{ background: '#555', top: '75%' }} />
        </>
      ) : (
        !data.hideRightSource && <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
      )}
      {data.leftSource && (
        <Handle type="source" position={Position.Left} id="left-source" style={{ background: '#555' }} />
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
    padding: '8px', borderRadius: '10px', background: '#fef08a',
    border: '1px solid #facc15', color: '#334155',
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
    <Handle type="target" position={Position.Left} style={{ background: '#facc15' }} />
    <Handle type="source" position={Position.Right} style={{ background: '#facc15' }} />
  </div>
)

const TcelNode = ({ data }) => (
  <div style={{
    padding: '8px', borderRadius: '10px', background: '#ffedd5',
    border: '1px solid #f97316', color: '#334155',
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

const PVSystNode = ({ data }) => (
  <div style={{
    ...baseNodeStyle, padding: '12px', borderRadius: '10px', 
    width: '120px', height: data.height || '120px', 
    background: '#ffffff',
    border: '1px solid #233772',
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
    <Handle type="target" position={Position.Left} style={{ background: '#233772' }} />
    <Handle type="source" position={Position.Bottom} id="out-bottom" style={{ background: '#233772' }} />
    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img 
        src="/pvsyst.png" 
        alt="" 
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
    </div>
    <div style={{ width: '100%', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img 
        src="/pvsyst_text.png" 
        alt="PVSYST" 
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
    </div>
  </div>
)

const PVLibNode = ({ data }) => {
  return (
  <div style={{
    ...baseNodeStyle, padding: '12px', borderRadius: '10px', 
    width: '120px', height: data.height || '120px', 
    background: '#ffffff',
    border: '2px solid #0ea5e9',
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s'
  }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
    <Handle type="target" position={Position.Left} style={{ background: '#0ea5e9' }} />
    <Handle type="source" position={Position.Right} id="out-right" style={{ background: '#0ea5e9' }} />
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '26px', fontWeight: 800, color: '#0ea5e9', letterSpacing: '-1px' }}>PV</span>
        <span style={{ fontSize: '26px', fontWeight: 300, color: '#0ea5e9', letterSpacing: '-1px' }}>lib</span>
      </div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginTop: '4px' }}>Python Model</div>
    </div>
  </div>
)}

const CurtailmentNode = ({ data }) => (
  <div style={{
    padding: '8px', borderRadius: '10px', background: '#fee2e2',
    border: '1px solid #ef4444', color: '#334155',
    width: '120px', height: '100px', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    textAlign: 'center', boxShadow: '0 6px 15px rgba(0,0,0,0.3)',
    position: 'relative', cursor: 'pointer', transition: 'all 0.2s'
  }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
    <div style={{ fontSize: '14px', fontWeight: 700, color: '#b91c1c' }}>Filtro de<br/>Curtailment</div>
    <div style={{ fontSize: '9px', color: '#7f1d1d', marginTop: '4px', lineHeight: '1.2', fontWeight: 600 }}>
      Ref: {data.curtailmentRefMin ?? 52.8} MW<br/>
      Mg: {data.curtailmentRefMargin ?? 3}% | Tol: {data.curtailmentDiffMargin ?? 5}%
    </div>
    <Handle type="target" position={Position.Left} id="target-1" style={{ background: '#ef4444', top: '20px' }} />
    <Handle type="target" position={Position.Left} id="target-2" style={{ background: '#ef4444', top: '80px' }} />
    <Handle type="source" position={Position.Right} style={{ background: '#ef4444' }} />
  </div>
)

const nodeTypes = {
  default: BoxNode,
  box: BoxNode,
  circle: CircleNode,
  diamond: DiamondNode,
  chart: ChartNode,
  geff: GeffNode,
  tcel: TcelNode,
  curtailment: CurtailmentNode,
  pvsyst: PVSystNode,
  pvlib: PVLibNode
}

const edgeTypes = {
  offsetSmoothStep: OffsetSmoothStepEdge
}

// ── INITIAL DATA ─────────────────────────────────────────────────────────

const initialNodes = [
  { id: 'gpoa',          type: 'box',         position: { x: 60,  y: 20  }, data: { label: 'G<sub>poa</sub>', color: 'yellow', aggregator: true, inputs: [], operation: 'sum', hasMultipleOutputs: true, leftTarget: true } },
  { id: 'grear',         type: 'box',         position: { x: 60,  y: 80  }, data: { label: 'G<sub>rear</sub>', color: 'yellow', aggregator: true, inputs: [], operation: 'sum', leftTarget: true } },
  { id: 'tracker',       type: 'box',         position: { x: 60,  y: 140 }, data: { label: 'Tracker', color: 'purple', aggregator: true, inputs: [], operation: 'sum', leftSource: true, hideRightSource: true } },
  { id: 'tamb',          type: 'box',         position: { x: 60,  y: 200 }, data: { label: 'T<sub>amb</sub>', color: 'orange', aggregator: true, inputs: [], operation: 'sum' } },
  { id: 'tmod',          type: 'box',         position: { x: 60,  y: 260 }, data: { label: 'T<sub>mod</sub>', color: 'orange', aggregator: true, inputs: [], operation: 'sum' } },
  { id: 'sujidade',      type: 'box',         position: { x: 60,  y: 320 }, data: { label: 'Sujidade', color: 'brown', aggregator: true, inputs: [], operation: 'sum', hideRightSource: true } },
  { id: 'potencia_ppc',  type: 'box',         position: { x: 60,  y: 380 }, data: { label: 'Potência PPC', color: 'green', aggregator: true, inputs: [], operation: 'sum', hasMultipleOutputs: false } },
  { id: 'referencia_ppc',type: 'box',         position: { x: 60,  y: 440 }, data: { label: 'Referência PPC', color: 'teal', aggregator: true, inputs: [], operation: 'sum', hideRightSource: false } },
  { id: 'energia_pmi',   type: 'box',         position: { x: 60,  y: 500 }, data: { label: 'Energia PMI', color: 'teal', aggregator: true, inputs: [], operation: 'sum' } },
  { id: 'geff',          type: 'geff',        position: { x: 270, y: 30  }, data: { label: 'Geff', beta: 1.0, SSF: 0.05, MLF: 0.02 } },
  { id: 'tcel',          type: 'tcel',        position: { x: 270, y: 240 }, data: { label: 'Tcel' } },
  { id: 'curtailment',   type: 'curtailment', position: { x: 260, y: 380 }, data: { label: 'Curtailment', curtailmentRefMin: 52.8, curtailmentRefMargin: 3, curtailmentDiffMargin: 5 } },
  { 
    id: 'simultaneidade', 
    type: 'box', 
    position: { x: 430, y: 190 }, 
    data: { 
      label: 'Dados Válidos', 
      color: 'gray', 
      outputName: 'Dados Válidos',
      width: '130px', 
      height: '120px',
      customTargets: [
        { id: 'target-top', position: Position.Top },
        { id: 'target-bottom-1', position: Position.Bottom, style: { left: '33%' } },
        { id: 'target-bottom-2', position: Position.Bottom, style: { left: '67%' } },
        { id: 'target-left-top', position: Position.Left, style: { top: '20px' } },
        { id: 'target-left-bottom', position: Position.Left, style: { top: '100px' } }
      ]
    } 
  },
  { id: 'pvlib', type: 'pvlib', position: { x: 630, y: 80 }, data: { height: '70px' } },
  { id: 'pvsyst', type: 'pvsyst', position: { x: 630, y: 190 }, data: { height: '120px' } },
  { 
    id: 'epi', 
    type: 'box', 
    position: { x: 630, y: 380 }, 
    data: { 
      label: 'EPI', 
      color: 'gray', 
      aggregator: true,
      leftTarget: true,
      inputs: [], 
      operation: 'sum', 
      width: '120px',
      height: '80px',
      hideRightSource: true,
      customTargets: [
        { id: 'target-top', position: Position.Top },
        { id: 'target-bottom', position: Position.Bottom }
      ]
    } 
  }
]


const initialEdges = [
  { id: 'e-gpoa-geff', source: 'gpoa', sourceHandle: 'out-a', target: 'geff', type: 'offsetSmoothStep', data: { centerX: 200 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-grear-geff', source: 'grear', target: 'geff', type: 'offsetSmoothStep', data: { centerX: 200 }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-tracker-gpoa', source: 'tracker', sourceHandle: 'left-source', target: 'gpoa', targetHandle: 'target', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, markerStart: { type: MarkerType.ArrowClosed, orient: 'auto-start-reverse' } },
  { id: 'e-tracker-grear', source: 'tracker', sourceHandle: 'left-source', target: 'grear', targetHandle: 'target', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, markerStart: { type: MarkerType.ArrowClosed, orient: 'auto-start-reverse' } },
  { id: 'e-tmod-tcel', source: 'tmod', target: 'tcel', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-gpoa-tcel', source: 'gpoa', sourceHandle: 'out-b', target: 'tcel', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-geff-simult', source: 'geff', target: 'simultaneidade', targetHandle: 'target-top', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-tamb-simult', source: 'tamb', target: 'simultaneidade', targetHandle: 'target-left-top', type: 'straight', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-tcel-simult', source: 'tcel', target: 'simultaneidade', targetHandle: 'target-left-bottom', type: 'straight', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-potencia_ppc-curtailment', source: 'potencia_ppc', target: 'curtailment', targetHandle: 'target-1', type: 'straight', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-referencia_ppc-curtailment', source: 'referencia_ppc', target: 'curtailment', targetHandle: 'target-2', type: 'straight', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-curtailment-simult', source: 'curtailment', target: 'simultaneidade', targetHandle: 'target-bottom-1', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-energia_pmi-simult', source: 'energia_pmi', target: 'simultaneidade', targetHandle: 'target-bottom-2', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-simult-pvlib', source: 'simultaneidade', target: 'pvlib', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-pvlib-epi', source: 'pvlib', sourceHandle: 'out-right', target: 'epi', targetHandle: 'target-top', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-simult-pvsyst', source: 'simultaneidade', target: 'pvsyst', type: 'straight', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-pvsyst-epi', source: 'pvsyst', sourceHandle: 'out-bottom', target: 'epi', targetHandle: 'target-top', type: 'straight', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e-energia-epi', source: 'energia_pmi', target: 'epi', targetHandle: 'target-bottom', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }
]

// ── COMPONENT ─────────────────────────────────────────────────────────

const getGradientColor = (val, target, tol) => {
  if (isNaN(tol) || tol === null || tol === undefined) tol = 0.03;

  if (val < target - tol) {
    return { bg: '#fee2e2', text: '#991b1b' }; // Vermelho Claro (Abaixo lim. inferior)
  } else if (val > target + tol) {
    return { bg: '#dbeafe', text: '#1e3a8a' }; // Azul Claro (Acima lim. superior)
  } else {
    // Calcula a distância relativa da meta (0 = exato na meta, 1 = no limite da tolerância)
    const d = Math.abs(val - target);
    let t = d / tol;
    if (isNaN(t)) t = 0;
    const safeT = Math.max(0, Math.min(1, t));
    
    // Gradiente Fundo: Verde Médio (#bbf7d0 -> 187, 247, 208) para Amarelo Claro (#fef9c3 -> 254, 249, 195)
    const bgR = Math.round(187 + (254 - 187) * safeT);
    const bgG = Math.round(247 + (249 - 247) * safeT);
    const bgB = Math.round(208 + (195 - 208) * safeT);
    
    // Gradiente Texto: Verde Escuro (#166534 -> 22, 101, 52) para Amarelo Escuro (#854d0e -> 133, 77, 14)
    const textR = Math.round(22 + (133 - 22) * safeT);
    const textG = Math.round(101 + (77 - 101) * safeT);
    const textB = Math.round(52 + (14 - 52) * safeT);

    return { 
      bg: `rgb(${bgR}, ${bgG}, ${bgB})`, 
      text: `rgb(${textR}, ${textG}, ${textB})` 
    };
  }
};

const getEpiColor = (val, tol = 0.03) => {
  return getGradientColor(val, 1.0, tol);
};

const getPrWcprColor = (val, prPrev, tol) => {
  return getGradientColor(val, prPrev, tol);
};

const calculateAggregation = (rowsToAggregate, columns, potenciaInstalada, gammaPmpp, bifacialidade) => {
  const totals = {};
  if (!rowsToAggregate || rowsToAggregate.length === 0 || !columns) return totals;

  columns.forEach(col => {
    const isAverageCol = col.key.toLowerCase().startsWith('tamb') || 
                         col.key.toLowerCase().startsWith('tmod') || 
                         col.key.toLowerCase().startsWith('tcel') ||
                         col.key.toLowerCase().startsWith('sujidade') ||
                         col.key === 'tarrwtd' ||
                         col.key === 'pr_prevista' ||
                         col.key === 'pr_prevista_bifacial' ||
                         col.key === 'cap_medido' ||
                         col.key === 'cap_simulado' ||
                         col.key === 'astm_ratio' ||
                         col.key === 'astm_ratio_adaptive';
    const isPercentageString = col.key.toLowerCase().startsWith('tracker') || col.key.toLowerCase().startsWith('curtailment');

    let sum = 0;
    let count = 0;
    let hasNumber = false;

    let sumErrors = 0;
    let sumValidPoints = 0;
    let hasPercentageData = false;

    rowsToAggregate.forEach(row => {
      const val = row[col.key];
      if (isPercentageString && typeof val === 'string') {
        const match = val.match(/^(\d+)\s*\(([\d.]+)%\)$/);
        if (match) {
          const errors = parseInt(match[1], 10);
          const perc = parseFloat(match[2]);
          const valid = perc > 0 ? (errors / (perc / 100)) : 0;
          sumErrors += errors;
          sumValidPoints += valid;
          hasPercentageData = true;
        }
      } else if (typeof val === 'number') {
        sum += val;
        count++;
        hasNumber = true;
      }
    });

    if (['cap_ratio', 'cap_ratio_adaptive', 'astm_ratio', 'astm_ratio_adaptive'].includes(col.key)) {
      let sumMed = 0;
      let sumSim = 0;
      let hasNum = false;
      const medidoKey = col.key === 'cap_ratio' ? 'cap_medido' : 
                        col.key === 'cap_ratio_adaptive' ? 'cap_medido_adaptive' : 
                        col.key === 'astm_ratio' ? 'astm_medido' : 'astm_medido_adaptive';
      const simuladoKey = col.key === 'cap_ratio' ? 'cap_simulado' : 
                          col.key === 'cap_ratio_adaptive' ? 'cap_simulado_adaptive' : 
                          col.key === 'astm_ratio' ? 'astm_simulado' : 'astm_simulado_adaptive';

      rowsToAggregate.forEach(row => {
         if (typeof row[medidoKey] === 'number' && typeof row[simuladoKey] === 'number') {
             sumMed += row[medidoKey];
             sumSim += row[simuladoKey];
             hasNum = true;
         }
      });
      if (hasNum && sumSim !== 0) {
          totals[col.key] = (sumMed / sumSim) * 100;
      } else {
          totals[col.key] = '-';
      }
      return; // Skip normal aggregation for capacity ratios
    }
    
    if (isPercentageString && hasPercentageData) {
      const overallPerc = sumValidPoints > 0 ? (sumErrors / sumValidPoints) * 100 : 0;
      totals[col.key] = `${Math.round(sumErrors)} (${overallPerc.toFixed(1)}%)`;
    } else if (hasNumber) {
      totals[col.key] = isAverageCol ? (sum / count) : sum;
    } else {
      totals[col.key] = '-';
    }
  });
  
  if (totals['Energia PMI_válida'] && totals['E_Grid_Ajustada_válida']) {
    const totPmi = totals['Energia PMI_válida'];
    const totPvsyst = totals['E_Grid_Ajustada_válida'];
    if (typeof totPmi === 'number' && typeof totPvsyst === 'number' && totPvsyst !== 0) {
      totals['epi'] = totPmi / totPvsyst;
    }
  }
  
  if (totals['Energia PMI Corrigida_válida'] && totals['E_Grid_Ajustada_válida']) {
    const totPmiCorr = totals['Energia PMI Corrigida_válida'];
    const totPvsyst = totals['E_Grid_Ajustada_válida'];
    if (typeof totPmiCorr === 'number' && typeof totPvsyst === 'number' && totPvsyst !== 0) {
      totals['epi_corrigido'] = totPmiCorr / totPvsyst;
    }
  }
  
  if (totals['Energia PMI_válida'] && totals['pvlib_E_Grid_válida']) {
    const totPmi = totals['Energia PMI_válida'];
    const totPvlib = totals['pvlib_E_Grid_válida'];
    if (typeof totPmi === 'number' && typeof totPvlib === 'number' && totPvlib !== 0) {
      totals['epi_pvlib'] = totPmi / totPvlib;
    }
  }
  

  if (totals['GlobInc_válida'] && totals['geff_válida']) {
    const totGlob = totals['GlobInc_válida'];
    const totGeff = totals['geff_válida'];
    if (typeof totGeff === 'number' && typeof totGlob === 'number' && totGeff !== 0) {
      totals['fator_ajuste'] = totGeff / totGlob;
    }
  }
  
  if (totals['Energia PMI_válida'] && (totals['gpoa_válida'] || totals['GlobInc_válida']) && potenciaInstalada) {
    const totPmi = totals['Energia PMI_válida'];
    const totGpoa = totals['gpoa_válida'] || totals['GlobInc_válida'];
    if (typeof totPmi === 'number' && typeof totGpoa === 'number' && totGpoa !== 0) {
      totals['pr_medida'] = totPmi / (totGpoa * potenciaInstalada);
    }
  }

  if (totals['Energia PMI_válida'] && totals['gpoa_válida'] && totals['grear_válida'] && potenciaInstalada) {
    const totPmi = totals['Energia PMI_válida'];
    const totGpoa = totals['gpoa_válida'];
    const totGrear = totals['grear_válida'];
    const syntheticGeff = totGpoa + (totGrear * bifacialidade);
    if (typeof totPmi === 'number' && typeof syntheticGeff === 'number' && syntheticGeff !== 0) {
      totals['pr_medida_bifacial'] = totPmi / (syntheticGeff * potenciaInstalada);
    }
  }

  if (totals['E_Grid_Ajustada_válida'] && (totals['gpoa_válida'] || totals['GlobInc_válida']) && potenciaInstalada) {
    const totEsp = totals['E_Grid_Ajustada_válida'];
    const totGpoa = totals['gpoa_válida'] || totals['GlobInc_válida'];
    if (typeof totEsp === 'number' && typeof totGpoa === 'number' && totGpoa !== 0) {
      totals['pr_esperada'] = totEsp / (totGpoa * potenciaInstalada);
    }
  }

  if (totals['E_Grid_Ajustada_válida'] && totals['gpoa_válida'] && totals['grear_válida'] && potenciaInstalada) {
    const totEsp = totals['E_Grid_Ajustada_válida'];
    const totGpoa = totals['gpoa_válida'];
    const totGrear = totals['grear_válida'];
    const syntheticGeff = totGpoa + (totGrear * bifacialidade);
    if (typeof totEsp === 'number' && typeof syntheticGeff === 'number' && syntheticGeff !== 0) {
      totals['pr_esperada_bifacial'] = totEsp / (syntheticGeff * potenciaInstalada);
    }
  }
  
  if (totals['Energia PMI_válida'] && (totals['gpoa_válida'] || totals['GlobInc_válida']) && potenciaInstalada) {
    let sumEnergia = 0;
    let sumGpoaCorr = 0;
    let hasValidWcpr = false;
    
    rowsToAggregate.forEach(row => {
      const energia = row['Energia PMI_válida'];
      const gpoa = row['gpoa_válida'] || row['GlobInc_válida'];
      const tcel = row['tcel_válida'];
      const tref = row['tarrwtd'];
      if (typeof energia === 'number' && typeof gpoa === 'number' && typeof tcel === 'number' && typeof tref === 'number') {
        sumEnergia += energia;
        sumGpoaCorr += gpoa * (1 + (gammaPmpp / 100) * (tcel - tref));
        hasValidWcpr = true;
      }
    });
    
    if (hasValidWcpr && sumGpoaCorr > 0) {
      totals['wcpr'] = sumEnergia / (sumGpoaCorr * potenciaInstalada);
    }
  }

  if (totals['Energia PMI_válida'] && totals['gpoa_válida'] && totals['grear_válida'] && potenciaInstalada) {
    let sumEnergiaBifacial = 0;
    let sumGeffCorr = 0;
    let hasValidWcprBifacial = false;
    
    rowsToAggregate.forEach(row => {
      const energia = row['Energia PMI_válida'];
      const gpoa = row['gpoa_válida'];
      const grear = row['grear_válida'];
      const tcel = row['tcel_válida'];
      const tref = row['tarrwtd'];
      if (typeof energia === 'number' && typeof gpoa === 'number' && typeof grear === 'number' && typeof tcel === 'number' && typeof tref === 'number') {
        const syntheticGeff = gpoa + (grear * bifacialidade);
        sumEnergiaBifacial += energia;
        sumGeffCorr += syntheticGeff * (1 + (gammaPmpp / 100) * (tcel - tref));
        hasValidWcprBifacial = true;
      }
    });
    
    if (hasValidWcprBifacial && sumGeffCorr > 0) {
      totals['wcpr_bifacial'] = sumEnergiaBifacial / (sumGeffCorr * potenciaInstalada);
    }
  }
  
  let sumTambG = 0, sumGTamb = 0;
  let sumTmodG = 0, sumGTmod = 0;
  let sumTcelG = 0, sumGTcel = 0;
  let sumTambValidaG = 0, sumGTambValida = 0;
  let sumTmodValidaG = 0, sumGTmodValida = 0;
  let sumTcelValidaG = 0, sumGTcelValida = 0;

  rowsToAggregate.forEach(row => {
    const g = row['gpoa'] || row['GlobInc'] || 0;
    const gValida = row['gpoa_válida'] || row['GlobInc_válida'] || 0;
    
    if (typeof row['tamb'] === 'number') { sumTambG += row['tamb'] * g; sumGTamb += g; }
    if (typeof row['tmod'] === 'number') { sumTmodG += row['tmod'] * g; sumGTmod += g; }
    if (typeof row['tcel'] === 'number') { sumTcelG += row['tcel'] * g; sumGTcel += g; }
    
    if (typeof row['tamb_válida'] === 'number') { sumTambValidaG += row['tamb_válida'] * gValida; sumGTambValida += gValida; }
    if (typeof row['tmod_válida'] === 'number') { sumTmodValidaG += row['tmod_válida'] * gValida; sumGTmodValida += gValida; }
    if (typeof row['tcel_válida'] === 'number') { sumTcelValidaG += row['tcel_válida'] * gValida; sumGTcelValida += gValida; }
  });

  if (sumGTamb > 0 && totals['tamb'] !== undefined) totals['tamb'] = sumTambG / sumGTamb;
  if (sumGTmod > 0 && totals['tmod'] !== undefined) totals['tmod'] = sumTmodG / sumGTmod;
  if (sumGTcel > 0 && totals['tcel'] !== undefined) totals['tcel'] = sumTcelG / sumGTcel;
  
  if (sumGTambValida > 0 && totals['tamb_válida'] !== undefined) totals['tamb_válida'] = sumTambValidaG / sumGTambValida;
  if (sumGTmodValida > 0 && totals['tmod_válida'] !== undefined) totals['tmod_válida'] = sumTmodValidaG / sumGTmodValida;
  if (sumGTcelValida > 0 && totals['tcel_válida'] !== undefined) totals['tcel_válida'] = sumTcelValidaG / sumGTcelValida;
  
  return totals;
};

export default function FluxogramaView({ elementos = [], selectedDates = [], showTitle = true, mode = 'all', capacityTestDailyResults = null }) {
  const { usinaAtual } = useUsina()
  const { filterSettings } = useChartSettings()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const selectedBlock = useMemo(() => nodes.find(n => n.id === selectedNodeId)?.data, [nodes, selectedNodeId])
  const [inputsList, setInputsList] = useState([{ series: '', filter: '', sensors: [] }])
  const [operation, setOperation] = useState('sum')
  const [outputFilter, setOutputFilter] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [pvsystUploadProgress, setPvsystUploadProgress] = useState(0)
  const [tmyUploadProgress, setTmyUploadProgress] = useState(0)
  const [geffParams, setGeffParams] = useState({ beta: 1, SSF: 0, MLF: 0 })
  const [pvlibParams, setPvlibParams] = useState({
    latitude: 0, longitude: 0, altitude: 0, tz: 'America/Sao_Paulo',
    selected_modulos: [], selected_inversores: [],
    loss_ohm_dc: 1.5, loss_ohm_ac: 1.0, loss_ohm_ac_mt: 0, trafo_pnom: 0, trafo_iron_loss: 0, trafo_copper_loss: 0, soiling: 2.0
  })
  const [simultParams, setSimultParams] = useState({ geff: true, tamb: true, tcel: true, energia_pmi: true, curtailment: false, horario_valido_enabled: false, horario_start: "06:00", horario_end: "19:00" })
  const [trackerParams, setTrackerParams] = useState({ latitude: -23.55, longitude: -46.63, gcr: 0.3, max_angle: 60, tolerance: 10, tol_pontos_vento: 0, tol_pontos_travado: 0, margem_perda_cc: 0 })
  const [curtailmentParams, setCurtailmentParams] = useState({ refMin: 52.8, refMargin: 3, diffMargin: 5, resolutionMode: '1min' })
  const [soilParams, setSoilParams] = useState({ startTime: '', endTime: '', trimPercent: '' })
  const [energiaPmiParams, setEnergiaPmiParams] = useState({ 
    multiplier: 0.012, 
    inputType: 'energy_5min', 
    outputUnit: 'MW' 
  })
  const [allSeries, setAllSeries] = useState([])
  const [epiParams, setEpiParams] = useState({ energiaVar: '', irradianciaVar: '', ohmVar: '', earrayVar: '', tolerancia: 3, toleranciaPr: 5, toleranciaWcpr: 5 })
  
  const [epiTol, setEpiTol] = useState(0.03);
  const [prTol, setPrTol] = useState(0.05);
  const [wcprTol, setWcprTol] = useState(0.05);

  useEffect(() => {
    const epiNode = nodes.find(n => n.id === 'epi');
    if (epiNode && epiNode.data && epiNode.data.epiParams) {
      const { tolerancia, toleranciaPr, toleranciaWcpr } = epiNode.data.epiParams;
      if (tolerancia !== undefined && tolerancia !== null && tolerancia !== '') {
        const parsed = parseFloat(String(tolerancia).replace(',', '.'));
        if (!isNaN(parsed)) setEpiTol(parsed / 100);
      }
      if (toleranciaPr !== undefined && toleranciaPr !== null && toleranciaPr !== '') {
        const parsed = parseFloat(String(toleranciaPr).replace(',', '.'));
        if (!isNaN(parsed)) setPrTol(parsed / 100);
      }
      if (toleranciaWcpr !== undefined && toleranciaWcpr !== null && toleranciaWcpr !== '') {
        const parsed = parseFloat(String(toleranciaWcpr).replace(',', '.'));
        if (!isNaN(parsed)) setWcprTol(parsed / 100);
      }
    }
  }, [nodes]);
  const [equipamentos, setEquipamentos] = useState({ modulos: [], inversores: [] })

  // --- Processamento ---
  const [isProcessing, setIsProcessing] = useState(false)
  const [flowProgress, setFlowProgress] = useState(null) // { progress, total, current_day }
  const [showTrackerSensorInfo, setShowTrackerSensorInfo] = useState(false)
  const [showTrackerParamsInfo, setShowTrackerParamsInfo] = useState(false)
  const [showPvlibParamsInfo, setShowPvlibParamsInfo] = useState(false)
  const [showPvlibInstructions, setShowPvlibInstructions] = useState(false)
  const [toast, setToast] = useState(null)
  
  const pvsystFileInputRef = useRef(null)
  const tmyFileInputRef = useRef(null)
  const [pvsystColumns, setPvsystColumns] = useState([])
  const [isLoadingPvsystColumns, setIsLoadingPvsystColumns] = useState(false)

  // Estados para Tabela de Integrais Diárias
  const [rawIntegralsData, setRawIntegralsData] = useState({ columns: [], rows: [] })
  
  // Estados para Popup de Gráficos Diários
  const [chartModalDate, setChartModalDate] = useState(null)
  const [popupChartData, setPopupChartData] = useState(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState(null)
  const [chartXRange, setChartXRange] = useState(['00:00', '23:59'])
  const [chartRevision, setChartRevision] = useState(0)
  const [showChartExportMenu, setShowChartExportMenu] = useState(false)
  const popupChartRef = useRef(null)
  
  const integralsData = useMemo(() => {
    if (!rawIntegralsData?.rows || !capacityTestDailyResults) return rawIntegralsData;
    
    const newColumns = [
      { key: 'cap_ratio', label: 'Daily Capacity\nRatio (%) — Fixed RC', type: 'output', node_id: 'capacity_test', isCapacity: true },
      { key: 'cap_ratio_adaptive', label: 'Daily Capacity\nRatio (%) — Adaptive RC', type: 'output', node_id: 'capacity_test', isCapacity: true }
    ];

    // Determine the ASTM window dynamically from the first valid daily result if available
    let currentAstmWindow = 5; // default
    if (capacityTestDailyResults) {
      const firstDate = Object.keys(capacityTestDailyResults)[0];
      if (firstDate && capacityTestDailyResults[firstDate]?.astmWindow) {
        currentAstmWindow = capacityTestDailyResults[firstDate].astmWindow;
      }
    }
    
    newColumns.push({ 
      key: 'astm_ratio', 
      label: `ASTM Capacity\nRatio (%) — Fixed RC - ${currentAstmWindow} dias`, 
      type: 'output', 
      node_id: 'capacity_test', 
      isCapacity: true 
    });
    
    newColumns.push({ 
      key: 'astm_ratio_adaptive', 
      label: `ASTM Capacity\nRatio (%) — Adaptive RC - ${currentAstmWindow} dias`, 
      type: 'output', 
      node_id: 'capacity_test', 
      isCapacity: true 
    });
    
    let insertIdx = rawIntegralsData.columns.findIndex(c => c.type === 'validation');
    if (insertIdx === -1) {
      const tarrwtdIdx = rawIntegralsData.columns.findIndex(c => c.key === 'tarrwtd');
      insertIdx = tarrwtdIdx !== -1 ? tarrwtdIdx + 1 : rawIntegralsData.columns.length;
    }

    const mergedColumns = [
      ...rawIntegralsData.columns.slice(0, insertIdx),
      ...newColumns,
      ...rawIntegralsData.columns.slice(insertIdx)
    ];
    
    const newRows = rawIntegralsData.rows.map(row => {
      const daily = capacityTestDailyResults[row.date];
      if (daily) {
        return {
          ...row,
          cap_medido: daily.pMedido,
          cap_simulado: daily.pSimulado,
          cap_ratio: daily.ratio,
          cap_medido_adaptive: daily.pMedidoAdaptive,
          cap_simulado_adaptive: daily.pSimuladoAdaptive,
          cap_ratio_adaptive: daily.ratioAdaptive,
          astm_medido: daily.astmPMedido,
          astm_simulado: daily.astmPSimulado,
          astm_ratio: daily.astmRatio,
          astm_medido_adaptive: daily.astmPMedidoAdaptive,
          astm_simulado_adaptive: daily.astmPSimuladoAdaptive,
          astm_ratio_adaptive: daily.astmRatioAdaptive
        };
      }
      return row;
    });
    
    return { columns: mergedColumns, rows: newRows };
  }, [rawIntegralsData, capacityTestDailyResults]);
  const [isLoadingIntegrals, setIsLoadingIntegrals] = useState(false)
  const [integralsProgress, setIntegralsProgress] = useState(0)
  const [integralsError, setIntegralsError] = useState(null)
  const [potenciaInstalada, setPotenciaInstalada] = useState(null)

  useEffect(() => {
    if (!usinaAtual) {
      setPotenciaInstalada(null)
      return
    }
    fetchDetailedUsinas()
      .then(usinas => {
        const u = usinas.find(x => x.nome === usinaAtual)
        if (u && u.total_mwp) {
          setPotenciaInstalada(u.total_mwp * 1000)
        } else {
          setPotenciaInstalada(null)
        }
      })
      .catch(console.error)
  }, [usinaAtual])
  const tableRef = useRef(null)
  const graficosPrincipaisRef = useRef(null)
  const [showPdfMenu, setShowPdfMenu] = useState(false)
  const [showInputs, setShowInputs] = useState(true)
  const [showMeasured, setShowMeasured] = useState(true)
  const [showValid, setShowValid] = useState(true)
  const [showResults, setShowResults] = useState(true)
  const [showPR, setShowPR] = useState(true)
  const [showValidation, setShowValidation] = useState(true)
  const [showValidInfo, setShowValidInfo] = useState(false)
  const [showOnlyValidDays, setShowOnlyValidDays] = useState(false)
  const [aggregationMode, setAggregationMode] = useState('daily');
  const [chartSeries, setChartSeries] = useState([]);
  const [visibleVars, setVisibleVars] = useState({
    gpoa: true,
    grear: true,
    geff: true,
    tamb: true,
    tmod: true,
    tcel: true,
    sujidade_dia: true,
    sujidade_hora: true,
    sujidade_media: true,
    energia: true,
    tracker: true,
    energia_pmi: true,
    potencia_ppc: true,
    referencia_ppc: true,
    curtailment: true,
    perdida_tracker: true,
    recuperavel: true,
    pvsyst: true,
    epi: true,
    pr_medida: true,
    pr_medida_bifacial: true,
    pr_esperada: true,
    pr_esperada_bifacial: true,
    pr_prevista: true,
    pr_prevista_bifacial: true,
    wcpr: true,
    wcpr_bifacial: true,
    tarrwtd: true
  })

  const availableIrradianceSensors = useMemo(() => {
    const sensorsMap = new Map();
    nodes.forEach(n => {
      if ((n.id === 'gpoa' || n.id === 'grear') && n.data?.inputs) {
        n.data.inputs.forEach(inp => {
          const sName = typeof inp === 'string' ? inp : inp.series;
          if (sName) {
            sensorsMap.set(sName, n.id === 'gpoa' ? 'Gpoa' : 'Grear');
          }
        });
      }
    });
    return Array.from(sensorsMap.entries())
      .map(([name, source]) => ({ name, source }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  const gammaPmpp = useMemo(() => {
    const pvlibNode = nodes.find(n => n.id === 'pvlib');
    if (!pvlibNode || !pvlibNode.data?.pvlibParams?.selected_modulos || !equipamentos?.modulos) return -0.35;
    
    const selectedMods = pvlibNode.data.pvlibParams.selected_modulos;
    const mods = equipamentos.modulos.filter(m => selectedMods.includes(m.id));
    
    if (mods.length === 0) return -0.35;
    
    const sum = mods.reduce((acc, curr) => acc + (typeof curr.gamma === 'number' ? curr.gamma : -0.35), 0);
    return sum / mods.length;
  }, [nodes, equipamentos]);

  const bifacialidade = useMemo(() => {
    const geffNode = nodes.find(n => n.id === 'geff');
    return geffNode?.data?.beta ?? 1.0;
  }, [nodes]);

  useEffect(() => {
    if (selectedNodeId === 'pvlib' && usinaAtual) {
      if (selectedBlock?.pvlibParams) {
        setPvlibParams(selectedBlock.pvlibParams);
      } else {
        setPvlibParams({
          latitude: '', longitude: '', altitude: '', gcr: '', axis_tilt: 0, tz: 'America/Sao_Paulo',
          selected_modulos: [], selected_inversores: [],
          loss_ohm_dc: 0, loss_bt_ca: 0, loss_aux_kw: 0, mismatch: 0, lid: 0
        });
      }
    }
  }, [selectedNodeId, usinaAtual]);

  useEffect(() => {
    if (selectedNodeId === 'epi' && usinaAtual) {
      if (selectedBlock?.epiParams) {
        setEpiParams(selectedBlock.epiParams);
      } else {
        setEpiParams({
          energiaVar: '', irradianciaVar: '', ohmVar: '', earrayVar: ''
        });
      }
      
      setIsLoadingPvsystColumns(true);
      api.get(`/upload/pvsyst/columns?usina=${encodeURIComponent(usinaAtual)}`)
      .then(res => {
        const data = res.data;
        setPvsystColumns(Array.isArray(data) ? data : []);
        setIsLoadingPvsystColumns(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoadingPvsystColumns(false);
      });
    }
  }, [selectedNodeId, usinaAtual]);

  const handlePvsystUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!usinaAtual) {
      setToast({ message: 'Selecione uma usina primeiro', type: 'error' });
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('usina', usinaAtual);
    
    setToast({ message: 'Iniciando envio do arquivo PVSyst...', type: 'info' });
    setPvsystUploadProgress(1); // Set to 1 to show the bar immediately
    try {
      const res = await api.post(`/upload/pvsyst`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = res.data;
      const taskId = data.task_id;
      
      let completed = false;
      while (!completed) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const statusRes = await api.get(`/upload/status/${taskId}`);
        const statusData = statusRes.data;
        
        if (statusData.status === 'COMPLETED') {
          completed = true;
          setPvsystUploadProgress(100);
          setToast({ message: 'Upload do PVSyst concluído!', type: 'success' });
          setPvsystColumns(statusData.columns || []);
          setTimeout(() => setPvsystUploadProgress(0), 2000);
        } else if (statusData.status === 'FAILED') {
          completed = true;
          setPvsystUploadProgress(0);
          setToast({ message: `Erro no upload: ${statusData.message}`, type: 'error' });
        } else {
          setPvsystUploadProgress(statusData.progress);
        }
      }
    } catch (err) {
      setPvsystUploadProgress(0);
      setToast({ message: err.message, type: 'error' });
    }
    e.target.value = '';
  }

  const handleTmyUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!usinaAtual) {
      setToast({ message: 'Selecione uma usina primeiro', type: 'error' });
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('usina', usinaAtual);
    
    setToast({ message: 'Iniciando envio do arquivo TMY...', type: 'info' });
    setTmyUploadProgress(1); // Set to 1 to show the bar immediately
    try {
      const res = await api.post(`/upload/pvsyst/tmy`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const taskId = res.data.task_id;
      
      let completed = false;
      while (!completed) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const statusRes = await api.get(`/upload/status/${taskId}`);
        const statusData = statusRes.data;
        
        if (statusData.status === 'COMPLETED') {
          completed = true;
          setTmyUploadProgress(100);
          setToast({ message: 'Upload do TMY concluído!', type: 'success' });
          setTimeout(() => setTmyUploadProgress(0), 2000);
          loadIntegrals(usinaAtual);
        } else if (statusData.status === 'FAILED') {
          completed = true;
          setTmyUploadProgress(0);
          setToast({ message: `Erro no upload: ${statusData.message}`, type: 'error' });
        } else {
          setTmyUploadProgress(statusData.progress);
        }
      }
    } catch (err) {
      setTmyUploadProgress(0);
      setToast({ message: err.message, type: 'error' });
    }
    e.target.value = '';
  }

  const loadConfig = (usina) => {
    if (!usina) return
    fetchFlowConfig(usina)
      .then(config => {
        const nodeConfigs = config?.nodeConfigs
        if (!nodeConfigs) {
          setNodes(initialNodes)
          return
        }

        // Aplica apenas os campos per-usina por cima do layout padrão
        setNodes(initialNodes.map(node => {
          const cfg = nodeConfigs[node.id]
          if (!cfg) return node
          return { ...node, data: { ...node.data, ...cfg } }
        }))
      })
      .catch(() => {})
  }

  const loadIntegrals = (usina) => {
    if (!usina) return
    loadConfig(usina)
    setIsLoadingIntegrals(true)
    setIntegralsProgress(0)
    setIntegralsError(null)
    
    startFlowIntegrals(usina)
      .then(res => {
        const taskId = res.task_id;
        if (!taskId) throw new Error("Falha ao iniciar processamento de integrais.");
        
        const intervalId = setInterval(() => {
          getFlowIntegralsStatus(usina, taskId)
            .then(statusRes => {
              if (statusRes.status === 'processing') {
                setIntegralsProgress(statusRes.progress || 0);
              } else if (statusRes.status === 'done') {
                clearInterval(intervalId);
                setIntegralsProgress(100);
                
                let finalData = statusRes.result || { columns: [], rows: [] };
                if (finalData.columns) {
                  let prevCol = finalData.columns.find(c => c.key === 'pr_prevista');
                  let prevBifiCol = finalData.columns.find(c => c.key === 'pr_prevista_bifacial');
                  let tarrCol = finalData.columns.find(c => c.key === 'tarrwtd');
                  let wcprCol = finalData.columns.find(c => c.key === 'wcpr');
                  let wcprBifacialCol = finalData.columns.find(c => c.key === 'wcpr_bifacial');
                  finalData.columns = finalData.columns.filter(c => 
                    !['pr_medida', 'pr_medida_bifacial', 'pr_esperada', 'pr_esperada_bifacial', 'pr_prevista', 'pr_prevista_bifacial', 'wcpr', 'wcpr_bifacial', 'tarrwtd'].includes(c.key)
                  );

                  if (!prevCol) prevCol = { key: 'pr_prevista', label: 'PR Prevista', type: 'special', node_id: 'pvsyst_tmy' };
                  if (!prevBifiCol) prevBifiCol = { key: 'pr_prevista_bifacial', label: 'PR Prevista\n(Bifacial)', type: 'special', node_id: 'pvsyst_tmy' };
                  if (!tarrCol) tarrCol = { key: 'tarrwtd', label: 'TArrWtd', type: 'special', node_id: 'pvsyst_tmy' };
                  if (!wcprCol) wcprCol = { key: 'wcpr', label: 'WCPR', type: 'output', node_id: 'epi' };
                  if (!wcprBifacialCol) wcprBifacialCol = { key: 'wcpr_bifacial', label: 'WCPR\n(Bifacial)', type: 'output', node_id: 'epi' };

                  const epiPvlibIdx = finalData.columns.findIndex(c => c.key === 'epi_pvlib');
                  const prCol = { key: 'pr_medida', label: 'PR Medida', type: 'output', node_id: 'epi' };
                  const prBifacialCol = { key: 'pr_medida_bifacial', label: 'PR Medida\n(Bifacial)', type: 'output', node_id: 'epi' };
                  const prEspCol = { key: 'pr_esperada', label: 'PR Esperada', type: 'output', node_id: 'epi' };
                  const prEspBifacialCol = { key: 'pr_esperada_bifacial', label: 'PR Esperada\n(Bifacial)', type: 'output', node_id: 'epi' };
                  
                  if (!finalData.columns.some(c => c.key === 'pr_esperada')) {
                    const orderedCols = [prEspCol, prCol, wcprCol, prevCol, prEspBifacialCol, prBifacialCol, wcprBifacialCol, prevBifiCol, tarrCol];
                    if (epiPvlibIdx !== -1) {
                      finalData.columns.splice(epiPvlibIdx + 1, 0, ...orderedCols);
                    } else {
                      finalData.columns.push(...orderedCols);
                    }
                  }
                }
                setRawIntegralsData(finalData);
                setIsLoadingIntegrals(false);
              } else if (statusRes.status === 'error') {
                clearInterval(intervalId);
                throw new Error(statusRes.error || "Erro no processamento.");
              }
            })
            .catch(err => {
              clearInterval(intervalId);
              console.error("Erro ao verificar status das integrais:", err);
              setIntegralsError(err.message || "Erro ao carregar dados de integrais.");
              setIsLoadingIntegrals(false);
            });
        }, 500);
      })
      .catch(err => {
        console.error("Erro ao iniciar integrais:", err);
        setIntegralsError(err.message || "Erro ao carregar dados de integrais.");
        setIsLoadingIntegrals(false);
      });
  }

  useEffect(() => {
    if (usinaAtual) {
      loadIntegrals(usinaAtual)
    } else {
      setRawIntegralsData({ columns: [], rows: [] })
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

  const addChartSeries = () => {
    if (!integralsData?.columns || integralsData.columns.length === 0) return;
    
    // Default to the first numeric column available
    const firstCol = integralsData.columns.find(c => c.key !== 'date' && c.key !== 'val_validacao') || integralsData.columns[0];
    
    setChartSeries(prev => {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
      const nextColor = colors[prev.length % colors.length];
      
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        columnKey: firstCol.key,
        type: 'bar',
        axis: 'left',
        color: nextColor,
        inheritColor: false,
        showTolerance: false
      }];
    });
  };

  const removeChartSeries = (id) => {
    setChartSeries(prev => prev.filter(s => s.id !== id));
  };

  const updateChartSeries = (id, field, value) => {
    setChartSeries(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };


  const displayRows = useMemo(() => {
    if (!integralsData.rows || integralsData.rows.length === 0) return [];
    
    const allSelectedRows = integralsData.rows.filter(row => selectedDates.includes(row.date));

    if (aggregationMode === 'daily') {
       let dailyRows = allSelectedRows.filter(row => {
         if (!showOnlyValidDays) return true;
         return row['val_validacao'] === 'Dia Válido';
       });
       
       return dailyRows.map(r => {
         const row = { ...r };
         if (potenciaInstalada) {
             const energiaPmi = row['Energia PMI_válida'];
             const gpoa = row['gpoa_válida'] || row['GlobInc_válida'];
             if (typeof energiaPmi === 'number' && typeof gpoa === 'number' && gpoa > 0) {
                 row['pr_medida'] = energiaPmi / (gpoa * potenciaInstalada);
             }
             
             const gpoa_val = row['gpoa_válida'];
             const grear_val = row['grear_válida'];
             if (typeof energiaPmi === 'number' && typeof gpoa_val === 'number' && typeof grear_val === 'number') {
                 const syntheticGeff = gpoa_val + (grear_val * bifacialidade);
                 if (syntheticGeff > 0) {
                     row['pr_medida_bifacial'] = energiaPmi / (syntheticGeff * potenciaInstalada);
                 }
             }
             
             const energiaEsp = row['E_Grid_Ajustada_válida'];
             if (typeof energiaEsp === 'number' && typeof gpoa === 'number' && gpoa > 0) {
                 row['pr_esperada'] = energiaEsp / (gpoa * potenciaInstalada);
             }
             if (typeof energiaEsp === 'number' && typeof gpoa_val === 'number' && typeof grear_val === 'number') {
                 const syntheticGeff = gpoa_val + (grear_val * bifacialidade);
                 if (syntheticGeff > 0) {
                     row['pr_esperada_bifacial'] = energiaEsp / (syntheticGeff * potenciaInstalada);
                 }
             }
             
             const tcel = row['tcel_válida'];
             const tref = row['tarrwtd'];
             if (typeof energiaPmi === 'number' && typeof gpoa === 'number' && typeof tcel === 'number' && typeof tref === 'number' && gpoa > 0) {
                 const gpoa_corr = gpoa * (1 + (gammaPmpp / 100) * (tcel - tref));
                 if (gpoa_corr > 0) {
                     row['wcpr'] = energiaPmi / (gpoa_corr * potenciaInstalada);
                 }
             }
             if (typeof energiaPmi === 'number' && typeof gpoa_val === 'number' && typeof grear_val === 'number' && typeof tcel === 'number' && typeof tref === 'number') {
                 const syntheticGeff = gpoa_val + (grear_val * bifacialidade);
                 if (syntheticGeff > 0) {
                     const geff_corr = syntheticGeff * (1 + (gammaPmpp / 100) * (tcel - tref));
                     if (geff_corr > 0) {
                         row['wcpr_bifacial'] = energiaPmi / (geff_corr * potenciaInstalada);
                     }
                 }
             }
         }
         
         const totGlob = row['GlobInc_válida'];
         const totGeff = row['geff_válida'];
         if (typeof totGeff === 'number' && typeof totGlob === 'number' && totGeff !== 0) {
             row['fator_ajuste'] = totGeff / totGlob;
         }
         
         return row;
       });
    } else {
       const groupedByMonth = {};
       allSelectedRows.forEach(row => {
         const monthKey = row.date.substring(0, 7);
         if (!groupedByMonth[monthKey]) groupedByMonth[monthKey] = [];
         groupedByMonth[monthKey].push(row);
       });
       
       const monthlyRows = Object.keys(groupedByMonth).map(monthKey => {
         const rowsForMonth = groupedByMonth[monthKey];
         const totalDays = rowsForMonth.length;
         const validDays = rowsForMonth.filter(r => r.val_validacao === 'Dia Válido').length;
         
         const rowsToAggregate = showOnlyValidDays 
            ? rowsForMonth.filter(r => r.val_validacao === 'Dia Válido') 
            : rowsForMonth;

         const aggregatedRow = calculateAggregation(rowsToAggregate, integralsData.columns, potenciaInstalada, gammaPmpp, bifacialidade);
         
         const [year, month] = monthKey.split('-');
         aggregatedRow.date = `${month}/${year}`;
         aggregatedRow.val_validacao = `${validDays}/${totalDays} Válidos`;
         
         return aggregatedRow;
       });
       
       return monthlyRows.sort((a,b) => {
         const [mA, yA] = a.date.split('/');
         const [mB, yB] = b.date.split('/');
         const dateA = new Date(yA, parseInt(mA)-1);
         const dateB = new Date(yB, parseInt(mB)-1);
         return dateA - dateB;
       });
    }
  }, [integralsData, selectedDates, showOnlyValidDays, aggregationMode, potenciaInstalada, gammaPmpp, bifacialidade]);

  const getConditionalColor = (colKey, val, tol, fallbackColor, prPrevistaVal) => {
    if (['epi', 'epi_corrigido', 'epi_pvlib', 'cap_ratio', 'astm_ratio', 'cap_ratio_adaptive', 'astm_ratio_adaptive'].includes(colKey) && typeof val === 'number') {
       const rawVal = val / 100;
       return getEpiColor(rawVal, tol).bg;
    }
    if ((colKey === 'pr_medida' || colKey === 'pr_medida_bifacial' || colKey === 'wcpr' || colKey === 'wcpr_bifacial') && typeof val === 'number' && typeof prPrevistaVal === 'number') {
       return getPrWcprColor(val / 100, prPrevistaVal / 100, tol).bg;
    }
    return fallbackColor;
  };

  const generateChartDataAndShapes = (seriesArray) => {
    if (!displayRows || displayRows.length === 0 || seriesArray.length === 0) return { traces: [], shapes: [] };
    
    const xValues = displayRows.map(row => row.date);
    const traces = [];
    const shapes = [];

    seriesArray.forEach(series => {
      const colDef = integralsData?.columns?.find(c => c.key === series.columnKey);
      
      const yValues = displayRows.map(row => {
        const val = row[series.columnKey];
        if (typeof val === 'number') {
          if (['epi', 'epi_corrigido', 'epi_pvlib', 'pr_medida', 'pr_medida_bifacial', 'pr_esperada', 'pr_esperada_bifacial', 'pr_prevista', 'pr_prevista_bifacial', 'wcpr', 'wcpr_bifacial', 'fator_ajuste'].includes(series.columnKey)) {
             return val * 100; // Transform to percentage for better dual-axis scaling
          }
        }
        return val;
      });

      let markerColor = series.color;
      
      if (series.inheritColor) {
        markerColor = yValues.map((y, idx) => {
          let prPrevistaVal = displayRows[idx].pr_prevista;
          if (series.columnKey === 'pr_medida_bifacial' || series.columnKey === 'wcpr_bifacial') prPrevistaVal = displayRows[idx].pr_prevista_bifacial;
          if (typeof prPrevistaVal === 'number') prPrevistaVal *= 100;
          
          let specificTol = epiTol;
          if (series.columnKey === 'pr_medida' || series.columnKey === 'pr_medida_bifacial') specificTol = prTol;
          else if (series.columnKey === 'wcpr' || series.columnKey === 'wcpr_bifacial') specificTol = wcprTol;
          
          return getConditionalColor(series.columnKey, y, specificTol, series.color, prPrevistaVal);
        });
      }

      traces.push({
        x: xValues,
        y: yValues,
        type: series.type === 'bar' ? 'bar' : 'scatter',
        mode: series.type === 'line' ? 'lines+markers' : undefined,
        name: colDef ? colDef.label : series.columnKey,
        yaxis: series.axis === 'right' ? 'y2' : 'y1',
        marker: { color: markerColor },
        line: { color: series.color, width: 2 }
      });

      // Add tolerance traces for dynamic targets (PR)
      if (series.showTolerance && (series.columnKey === 'pr_medida' || series.columnKey === 'pr_medida_bifacial' || series.columnKey === 'wcpr' || series.columnKey === 'wcpr_bifacial')) {
        const specificTol = (series.columnKey === 'pr_medida' || series.columnKey === 'pr_medida_bifacial') ? prTol : wcprTol;
        
        const prevKey = (series.columnKey === 'pr_medida_bifacial' || series.columnKey === 'wcpr_bifacial') ? 'pr_prevista_bifacial' : 'pr_prevista';
        const yUpper = displayRows.map(row => {
          return typeof row[prevKey] === 'number' ? (row[prevKey] * 100) + (specificTol * 100) : null;
        });
        const yLower = displayRows.map(row => {
          return typeof row[prevKey] === 'number' ? (row[prevKey] * 100) - (specificTol * 100) : null;
        });

        traces.push({
          x: xValues,
          y: yUpper,
          type: 'scatter',
          mode: 'lines',
          name: `Lim. Sup. (${colDef ? colDef.label : series.columnKey})`,
          yaxis: series.axis === 'right' ? 'y2' : 'y1',
          line: { color: series.color, width: 2, dash: 'dot' },
          showlegend: false,
          hoverinfo: 'skip'
        });

        traces.push({
          x: xValues,
          y: yLower,
          type: 'scatter',
          mode: 'lines',
          name: `Lim. Inf. (${colDef ? colDef.label : series.columnKey})`,
          yaxis: series.axis === 'right' ? 'y2' : 'y1',
          line: { color: series.color, width: 2, dash: 'dot' },
          showlegend: false,
          hoverinfo: 'skip'
        });
      }

      // Shapes are used for static bounds (EPI)
      if (series.showTolerance && ['epi', 'epi_corrigido', 'epi_pvlib', 'cap_ratio', 'astm_ratio', 'cap_ratio_adaptive', 'astm_ratio_adaptive'].includes(series.columnKey)) {
        const yRef = series.axis === 'right' ? 'y2' : 'y1';
        const lowerLimit = 100 * (1 - epiTol);
        const upperLimit = 100 * (1 + epiTol);
        
        shapes.push({
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          yref: yRef,
          y0: lowerLimit,
          y1: lowerLimit,
          line: { color: series.color, width: 2, dash: 'dot' }
        });
        
        shapes.push({
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          yref: yRef,
          y0: upperLimit,
          y1: upperLimit,
          line: { color: series.color, width: 2, dash: 'dot' }
        });

        // Linha da Meta (100%)
        shapes.push({
          type: 'line',
          xref: 'paper',
          x0: 0,
          x1: 1,
          yref: yRef,
          y0: 100,
          y1: 100,
          line: { color: 'rgba(128,128,128,0.5)', width: 1, dash: 'dot' }
        });
      }
    });
    
    let maxTol = -Infinity;
    let minTol = Infinity;

    traces.forEach(t => {
      if (t.name && (t.name.includes('Lim. Sup.') || t.name.includes('Lim. Inf.'))) {
        t.y.forEach(val => {
          if (val !== null && val !== undefined) {
            maxTol = Math.max(maxTol, val);
            minTol = Math.min(minTol, val);
          }
        });
      }
    });

    shapes.forEach(s => {
      if (s.y0 !== undefined) {
        maxTol = Math.max(maxTol, s.y0, s.y1);
        minTol = Math.min(minTol, s.y0, s.y1);
      }
    });

    let yAxisRange = [80, 120];
    if (maxTol !== -Infinity && minTol !== Infinity) {
      let upper = Math.ceil((maxTol + 5) / 5) * 5;
      let lower = Math.floor((minTol - 5) / 5) * 5;
      yAxisRange = [lower, upper];
    }

    return { traces, shapes, yAxisRange };
  };

  const chartData = useMemo(() => {
    return generateChartDataAndShapes(chartSeries).traces;
  }, [displayRows, chartSeries, integralsData, epiTol, prTol, wcprTol]);

  const chartShapes = useMemo(() => {
    return generateChartDataAndShapes(chartSeries).shapes;
  }, [displayRows, chartSeries, integralsData, epiTol, prTol, wcprTol]);

  const fixedEpiChart = useMemo(() => {
    return generateChartDataAndShapes([{ columnKey: 'epi_pvlib', type: 'bar', axis: 'left', color: '#3b82f6', inheritColor: true, showTolerance: true }]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const fixedEpiNormalChart = useMemo(() => {
    return generateChartDataAndShapes([{ columnKey: 'epi', type: 'bar', axis: 'left', color: '#3b82f6', inheritColor: true, showTolerance: true }]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const fixedCapRatioChart = useMemo(() => {
    return generateChartDataAndShapes([{ columnKey: 'cap_ratio', type: 'bar', axis: 'left', color: '#3b82f6', inheritColor: true, showTolerance: true }]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const fixedAstmRatioChart = useMemo(() => {
    return generateChartDataAndShapes([{ columnKey: 'astm_ratio', type: 'bar', axis: 'left', color: '#3b82f6', inheritColor: true, showTolerance: true }]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const adaptiveCapRatioChart = useMemo(() => {
    return generateChartDataAndShapes([{ columnKey: 'cap_ratio_adaptive', type: 'bar', axis: 'left', color: '#1d4ed8', inheritColor: true, showTolerance: true }]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const adaptiveAstmRatioChart = useMemo(() => {
    return generateChartDataAndShapes([{ columnKey: 'astm_ratio_adaptive', type: 'bar', axis: 'left', color: '#1d4ed8', inheritColor: true, showTolerance: true }]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const fixedPrChart = useMemo(() => {
    return generateChartDataAndShapes([
      { columnKey: 'pr_medida', type: 'bar', axis: 'left', color: '#3b82f6', inheritColor: true, showTolerance: true },
      { columnKey: 'pr_prevista', type: 'line', axis: 'left', color: '#ca8a04', inheritColor: false, showTolerance: false }
    ]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const fixedPrBifacialChart = useMemo(() => {
    return generateChartDataAndShapes([
      { columnKey: 'pr_medida_bifacial', type: 'bar', axis: 'left', color: '#0ea5e9', inheritColor: true, showTolerance: true },
      { columnKey: 'pr_prevista_bifacial', type: 'line', axis: 'left', color: '#ca8a04', inheritColor: false, showTolerance: false }
    ]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const fixedWcprChart = useMemo(() => {
    return generateChartDataAndShapes([
      { columnKey: 'wcpr', type: 'bar', axis: 'left', color: '#3b82f6', inheritColor: true, showTolerance: true },
      { columnKey: 'pr_prevista', type: 'line', axis: 'left', color: '#ca8a04', inheritColor: false, showTolerance: false }
    ]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const fixedWcprBifacialChart = useMemo(() => {
    return generateChartDataAndShapes([
      { columnKey: 'wcpr_bifacial', type: 'bar', axis: 'left', color: '#0ea5e9', inheritColor: true, showTolerance: true },
      { columnKey: 'pr_prevista_bifacial', type: 'line', axis: 'left', color: '#ca8a04', inheritColor: false, showTolerance: false }
    ]);
  }, [displayRows, integralsData, epiTol, prTol, wcprTol]);

  const renderFixedChartUI = (title, chartObj, color) => {
    if (!chartObj || chartObj.traces.length === 0) return null;
    
    return (
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-secondary)', padding: '8px 16px', borderRadius: '8px 8px 0 0', border: '1px solid var(--border)', borderBottom: 'none' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
            {title}
          </div>
        </div>
        <div style={{ width: '100%', height: '300px', background: 'var(--bg-card)', borderRadius: '0 0 8px 8px', border: '1px solid var(--border)', overflow: 'hidden', padding: '10px' }}>
          <Plot
            data={chartObj.traces}
            layout={{
              autosize: true,
              margin: { l: 60, r: 60, t: 30, b: 60 },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { color: 'var(--text-secondary)', size: 11 },
              xaxis: { 
                type: 'category', 
                gridcolor: 'rgba(128,128,128,0.1)', 
                zerolinecolor: 'rgba(128,128,128,0.2)',
                range: chartObj.traces && chartObj.traces[0] ? [-0.5, chartObj.traces[0].x.length - 0.5] : undefined
              },
              yaxis: { title: 'Eixo Esquerdo', gridcolor: 'rgba(128,128,128,0.1)', zerolinecolor: 'rgba(128,128,128,0.2)', range: chartObj.yAxisRange || [80, 120] },
              shapes: chartObj.shapes,
              barmode: 'group',
              showlegend: false
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
            config={{ responsive: true, displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ['select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d'] }}
          />
        </div>
      </div>
    );
  };

  const totalsRow = useMemo(() => {
    if (!integralsData.rows || integralsData.rows.length === 0 || !integralsData.columns) return null;
    
    const baseRows = integralsData.rows
      .filter(row => selectedDates.includes(row.date))
      .filter(row => {
        if (!showOnlyValidDays) return true;
        return row['val_validacao'] === 'Dia Válido';
      });

    const totals = calculateAggregation(baseRows, integralsData.columns, potenciaInstalada, gammaPmpp, bifacialidade);
    totals.date = 'Total';
    
    return totals;
  }, [integralsData, selectedDates, showOnlyValidDays, potenciaInstalada, gammaPmpp, bifacialidade]);

  const visibleColumns = useMemo(() => {
    if (!integralsData.columns) return []
    return integralsData.columns.filter(col => {
      // 0. Colunas de Validação
      if (col.type === 'validation') {
         if (!showValidation) return false;
         return true;
      }

      // 1. Filtro de Exibir Entradas
      const isOutput = !col.label.includes('Entrada');
      if (!isOutput && !showInputs) return false;

      // 1.5. Filtro de Exibir Dados Medidos, Válidos e Resultados
      if (col.type === 'output' || col.type === 'special') {
        const isResultColumn = ['pr_medida', 'pr_medida_bifacial', 'pr_esperada', 'pr_esperada_bifacial', 'pr_prevista', 'pr_prevista_bifacial', 'wcpr', 'wcpr_bifacial', 'tarrwtd', 'fator_ajuste', 'epi', 'globinc', 'energia_esperada', 'energia_esperada_ajustada', 'energia_pmi', 'e_grid', 'perdida', 'recuperável', 'pmi corrigida'].some(k => col.key.toLowerCase().includes(k)) || col.key.toLowerCase().startsWith('pvsyst');
        
        if (isResultColumn) {
          if (!showResults) return false;
        } else {
          const isValidCol = col.key.endsWith('_válida');
          if (isValidCol && !showValid) return false;
          if (!isValidCol && !showMeasured) return false;
        }
      }

      // 2. Filtro de Variáveis Habilitadas
      const colKey = col.key.toLowerCase();
      if (colKey.startsWith('gpoa') && !visibleVars.gpoa) return false;
      if (colKey.startsWith('grear') && !visibleVars.grear) return false;
      if (colKey.startsWith('geff') && !visibleVars.geff) return false;
      if (colKey.startsWith('tamb') && !visibleVars.tamb) return false;
      if (colKey.startsWith('tmod') && !visibleVars.tmod) return false;
      if (colKey.startsWith('tcel') && !visibleVars.tcel) return false;
      if (colKey === 'sujidade' && !visibleVars.sujidade_dia) return false;
      if (colKey === 'sujidade_restricted' && !visibleVars.sujidade_hora) return false;
      if (colKey === 'sujidade_trimmed' && !visibleVars.sujidade_media) return false;
      if (colKey.startsWith('sujidade_in') && !visibleVars.sujidade_dia && !visibleVars.sujidade_hora && !visibleVars.sujidade_media) return false;
      if (colKey.startsWith('tracker') && !visibleVars.tracker) return false;
      if (colKey.startsWith('curtailment') && !visibleVars.curtailment) return false;
      if (colKey.startsWith('energia_pmi')) return visibleVars.energia_pmi;
      if (colKey.startsWith('referencia_ppc')) return visibleVars.referencia_ppc;
      if (colKey.startsWith('potencia_ppc')) return visibleVars.potencia_ppc;
      if (colKey.startsWith('energia pmi corrigida')) return visibleVars.energia_pmi;
      if (colKey.startsWith('energia pmi')) return visibleVars.energia_pmi;
      if (colKey.startsWith('energia')) return visibleVars.energia;
      if (colKey.startsWith('potência cc strings perdida')) return visibleVars.perdida_tracker;
      if (colKey.startsWith('potência ca recuperável')) return visibleVars.recuperavel;
      if (colKey.startsWith('fator_ajuste') || colKey.startsWith('globinc')) return visibleVars.pvsyst;
      if (colKey.startsWith('e_grid') || colKey.startsWith('pvsyst')) return visibleVars.pvsyst;
      if (colKey.startsWith('epi')) return visibleVars.epi;
      if (colKey === 'pr_medida') return visibleVars.pr_medida;
      if (colKey === 'pr_medida_bifacial') return visibleVars.pr_medida_bifacial;
      if (colKey === 'pr_esperada') return visibleVars.pr_esperada;
      if (colKey === 'pr_esperada_bifacial') return visibleVars.pr_esperada_bifacial;
      if (colKey === 'pr_prevista') return visibleVars.pr_prevista;
      if (colKey === 'pr_prevista_bifacial') return visibleVars.pr_prevista_bifacial;
      if (colKey === 'wcpr') return visibleVars.wcpr;
      if (colKey === 'wcpr_bifacial') return visibleVars.wcpr_bifacial;
      if (colKey === 'tarrwtd') return visibleVars.tarrwtd;

      return true;
    });
  }, [integralsData.columns, showInputs, showMeasured, showValid, showResults, showPR, showValidation, visibleVars]);

  const headerGroups = useMemo(() => {
    const groups = [];
    let currentGroup = null;
    
    visibleColumns.forEach((col) => {
      if (col.type === 'input' || col.type === 'validation') {
        if (currentGroup && currentGroup.type === col.type && currentGroup.node_id === col.node_id) {
          currentGroup.columns.push(col);
        } else {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = {
            type: col.type,
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
    loadEquipamentos()
  }, [usinaAtual])

  const loadEquipamentos = async () => {
    try {
      const res = await api.get('/settings/equipamentos')
      if (res.data) setEquipamentos(res.data)
    } catch (e) {
      console.error("Erro ao carregar equipamentos:", e)
    }
  }

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

  // Campos que são configurados por usina (tudo o mais vem do initialNodes = layout)
  const PER_USINA_FIELDS = [
    'inputs', 'outputFilter', 'operation', 'startTime', 'endTime', 'trimPercent',
    'trackerParams', 'beta', 'SSF', 'MLF', 'ppcRefValue', 'ppcMargin',
    'energiaPmiParams', 'simultParams', 'curtailmentRefMin', 'curtailmentRefMargin',
    'curtailmentDiffMargin', 'resolutionMode', 'epiParams', 'pvlibParams'
  ]

  // Persiste apenas os campos per-usina no flow_config.json
  const saveNodeConfig = async (nodesArr) => {
    if (!usinaAtual) return
    const nodeConfigs = {}
    nodesArr.forEach(n => {
      const cfg = {}
      PER_USINA_FIELDS.forEach(f => { if (n.data[f] !== undefined) cfg[f] = n.data[f] })
      
      // Sempre salvar os nós especiais (que não são box) para garantir que eles não desapareçam 
      // do fluxo no backend, mesmo que não tenham configuração específica.
      if (n.type !== 'box') {
        cfg['type'] = n.type
      }

      if (Object.keys(cfg).length > 0) nodeConfigs[n.id] = cfg
    })
    
    try {
      await saveFlowConfig(usinaAtual, { nodeConfigs })
      window.dispatchEvent(new Event('fluxograma_config_changed'))
    } catch (e) {
      console.error("Erro ao salvar config do fluxograma:", e)
    }
  }

  useEffect(() => {
    // Sempre começa do layout padrão — garante que qualquer usina (com ou sem config) veja o mesmo canvas
    setNodes(initialNodes)
    setEdges(initialEdges)
    setSelectedNodeId(null) // Fecha qualquer modal aberto ao trocar de usina
    if (usinaAtual) {
      loadConfig(usinaAtual)
    }
  }, [usinaAtual, setNodes, setEdges])

  useEffect(() => {
    const handleConfigChange = () => {
      if (usinaAtual) loadConfig(usinaAtual)
    }
    window.addEventListener('fluxograma_config_changed', handleConfigChange)
    return () => window.removeEventListener('fluxograma_config_changed', handleConfigChange)
  }, [usinaAtual])

  const handleRunFlow = async () => {
    if (!usinaAtual) return
    if (!selectedDates || selectedDates.length === 0) {
      setToast({
        title: 'Nenhum dia selecionado',
        message: 'Por favor, selecione os dias que deseja processar no menu lateral.',
        type: 'error'
      })
      setTimeout(() => {
        setToast(current => current?.title === 'Nenhum dia selecionado' ? null : current)
      }, 5000)
      return
    }
    try {
      setIsProcessing(true)
      setFlowProgress(null)

      // 1. Inicia a task em background (retorna imediatamente)
      const startRes = await runFlow(usinaAtual, selectedDates.join(','))
      const taskId = startRes.task_id

      if (!taskId) {
        // Fallback: se o backend retornou resultado direto (compatibilidade)
        if (startRes.status === 'ok') {
          setToast({ title: 'Processamento Concluído', message: `Processados ${startRes.processed_days} dias.`, type: 'success' })
          setTimeout(() => setToast(c => c?.title === 'Processamento Concluído' ? null : c), 5000)
          loadIntegrals(usinaAtual)
        }
        return
      }

      // 2. Polling a cada 2s até finalizar
      const poll = () => new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const status = await checkFlowStatus(usinaAtual, taskId)

            if (status.status === 'processing') {
              setFlowProgress({ progress: status.progress, total: status.total, current_day: status.current_day })
            } else if (status.status === 'done') {
              clearInterval(interval)
              resolve(status.result)
            } else if (status.status === 'error') {
              clearInterval(interval)
              reject(new Error(status.message || 'Erro no processamento'))
            }
          } catch (pollErr) {
            clearInterval(interval)
            reject(pollErr)
          }
        }, 2000)
      })

      const result = await poll()
      setToast({
        title: 'Processamento Concluído',
        message: `Foram processados com sucesso ${result.processed_days} dias de dados.`,
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
      setFlowProgress(null)
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
    } else if (key.startsWith('geff') || key.startsWith('tcel') || key.startsWith('globinc')) {
      return {
        color: '#f97316', // Laranja
        bgHeader: 'rgba(249, 115, 22, 0.05)',
        bgCell: 'rgba(249, 115, 22, 0.02)',
        bgTotal: 'rgba(249, 115, 22, 0.08)'
      };
    } else if (key.startsWith('tracker')) {
      return {
        color: '#6A1B9A', // Roxo escuro (cor do Elemento Tracker)
        bgHeader: 'rgba(106, 27, 154, 0.05)',
        bgCell: 'rgba(106, 27, 154, 0.02)',
        bgTotal: 'rgba(106, 27, 154, 0.08)'
      };
    } else if (key.startsWith('potencia_ppc') || key.startsWith('curtailment')) {
      return {
        color: '#22c55e', // Verde claro
        bgHeader: 'rgba(34, 197, 94, 0.05)',
        bgCell: 'rgba(34, 197, 94, 0.02)',
        bgTotal: 'rgba(34, 197, 94, 0.08)'
      };
    } else if (key.startsWith('referencia_ppc')) {
      return {
        color: '#00838F', // Azul esverdeado
        bgHeader: 'rgba(0, 131, 143, 0.05)',
        bgCell: 'rgba(0, 131, 143, 0.02)',
        bgTotal: 'rgba(0, 131, 143, 0.08)'
      };
    } else if (key === 'energia') {
      return {
        color: '#10b981', // Verde
        bgHeader: 'rgba(16, 185, 129, 0.05)',
        bgCell: 'rgba(16, 185, 129, 0.02)',
        bgTotal: 'rgba(16, 185, 129, 0.08)'
      };
    } else if (key.startsWith('energia_pmi') || key.startsWith('energia pmi') || key.startsWith('e_grid') || key.startsWith('pvlib')) {
      return {
        color: '#0277BD', // Azul (cor do Elemento Energia PMI)
        bgHeader: 'rgba(2, 119, 189, 0.05)',
        bgCell: 'rgba(2, 119, 189, 0.02)',
        bgTotal: 'rgba(2, 119, 189, 0.08)'
      };
    } else if (key.startsWith('fator_ajuste') || key.startsWith('epi')) {
      return {
        color: '#334155', // Cinza escuro
        bgHeader: 'rgba(51, 65, 85, 0.05)',
        bgCell: 'rgba(51, 65, 85, 0.02)',
        bgTotal: 'rgba(51, 65, 85, 0.08)'
      };
    } else if (key.startsWith('cap_') || key.startsWith('astm_')) {
      return {
        color: '#8b5cf6', // Violeta (Capacity Test)
        bgHeader: 'rgba(139, 92, 246, 0.05)',
        bgCell: 'rgba(139, 92, 246, 0.02)',
        bgTotal: 'rgba(139, 92, 246, 0.08)'
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
    if (label.startsWith('Sujidade (')) {
      const rest = label.slice('Sujidade '.length);
      const parts = rest.split(' ');
      let formattedRest = rest;
      if (parts.length > 1) {
        formattedRest = (
            <React.Fragment>
              {parts[0]}<br/>
              {parts.slice(1).join(' ')}
            </React.Fragment>
        );
      }
      return (
        <div style={{ lineHeight: '1.2' }}>
          Sujidade<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>{formattedRest}</span>
        </div>
      );
    }
    
    if (label === 'Tracker Piranômetro') {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Tracker<br/>
          Piranômetro
        </div>
      );
    }
    
    if (label.toLowerCase() === 'epi') return 'EPI';
    if (label.toLowerCase() === 'epi corrigido') {
      return (
        <div style={{ lineHeight: '1.2' }}>
          EPI<br/>
          Corrigido
        </div>
      );
    }
    if (label.toLowerCase() === 'pr medida') {
      return (
        <div style={{ lineHeight: '1.2' }}>
          PR<br/>
          Medida
        </div>
      );
    }
    if (label.toLowerCase() === 'pr esperada') {
      return (
        <div style={{ lineHeight: '1.2' }}>
          PR<br/>
          Esperada
        </div>
      );
    }
    if (label.toLowerCase() === 'pr prevista') {
      return (
        <div style={{ lineHeight: '1.2' }}>
          PR<br/>
          Prevista
        </div>
      );
    }
    if (label.toLowerCase() === 'curtailment') return 'Curtailment';

    if (label.startsWith('Fator de Ajuste')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Fator<br/>
          de<br/>
          Ajuste
        </div>
      );
    }
    if (label.startsWith('Energia Perdida Desvio Tracker')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia Perdida<br/>
          Desvio Tracker<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }
    
    if (label.startsWith('Energia CA Recuperável')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia CA<br/>
          Recuperável<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }

    if (label.startsWith('Energia Esperada Ajustada')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia<br/>
          Esperada<br/>
          Ajustada<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }
    
    if (label.startsWith('Energia Esperada PVLib')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia<br/>
          Esperada<br/>
          PVLib<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }
    
    if (label.startsWith('Energia Esperada')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia<br/>
          Esperada<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }

    if (label.startsWith('Energia PMI Corrigida')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia PMI<br/>
          Corrigida<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }
    
    if (label.startsWith('Energia Prevista Ajustada')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia<br/>
          Prevista<br/>
          Ajustada<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }
    
    if (label.startsWith('Energia Prevista')) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          Energia<br/>
          Prevista<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }

    const hasValido = label.includes(' (Válido)');
    const textToMatch = hasValido ? label.replace(' (Válido)', '') : label;
    let mainComponent = null;

    for (const rep of replacements) {
      if (textToMatch.startsWith(rep.key)) {
        const rest = textToMatch.slice(rep.key.length);
        mainComponent = <>{rep.base}<sub>{rep.sub}</sub>{rest}</>;
        break;
      }
    }
    
    if (!mainComponent) mainComponent = textToMatch;
    
    if (hasValido) {
      return (
        <div style={{ lineHeight: '1.2' }}>
          {mainComponent}<br/>
          <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}>(Válido)</span>
        </div>
      );
    }
    
    return mainComponent;
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
      case 'potencia_ppc':
        return <span>Potência PPC - Entradas</span>;
      case 'referencia_ppc':
        return <span>Referência PPC - Entradas</span>;
      case 'energia_pmi':
        return <span>Energia PMI - Entradas</span>;
      case 'tracker':
        return <span>Tracker Piranômetro - Entradas</span>;
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
      case 'potencia_ppc':
        return <>Potência PPC - Geração de Potência</>;
      case 'referencia_ppc':
        return <>Referência PPC</>;
      case 'energia_pmi':
        return <>Energia PMI - Geração de Energia (PMI)</>;
      case 'tracker':
        return <>Tracker - Posição/Ângulo do Seguidor</>;
      default:
        return nodeId;
    }
  };

  const openChartPopup = async (date) => {
    setChartModalDate(date)
    setChartXRange(['00:00', '23:59'])
    setChartRevision(0)
    setChartLoading(true)
    setChartError(null)
    try {
      const data = await fetchFluxogramaChart(usinaAtual, date)
      setPopupChartData(data)
    } catch (err) {
      console.error(err)
      setChartError(err.message || String(err))
    } finally {
      setChartLoading(false)
    }
  }

  const updateChartXRange = (newRange) => {
    setChartXRange(newRange)
    setChartRevision(r => r + 1)
  }

  const handleChartRelayout = (eventData) => {
    if (eventData['xaxis.range[0]'] && eventData['xaxis.range[1]']) {
      const minDate = new Date(eventData['xaxis.range[0]'])
      const maxDate = new Date(eventData['xaxis.range[1]'])
      const toHHMM = (d) => {
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        return `${hh}:${mm}`
      }
      setChartXRange([toHHMM(minDate), toHHMM(maxDate)])
      setChartRevision(r => r + 1)
    } else if (eventData['xaxis.autorange']) {
      setChartXRange(['00:00', '23:59'])
      setChartRevision(r => r + 1)
    }
  }

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
      {(mode === 'all' || mode === 'config') && (
      <div style={{ 
        width: 'fit-content', 
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
        <div style={{ width: '800px', height: `${canvasHeight}px`, position: 'relative', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: '8px', transition: 'height 0.3s ease' }}>
          <button
            onClick={handleRunFlow}
            disabled={isProcessing || !usinaAtual}
            style={{
              position: 'absolute', top: '12px', right: '12px', zIndex: 10,
              padding: '10px 20px', borderRadius: '8px', border: 'none',
              background: isProcessing ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b, #f97316)',
              color: '#fff', fontSize: '13px', fontWeight: '700', cursor: isProcessing ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 8
            }}
            onMouseEnter={e => !isProcessing && (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => !isProcessing && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {isProcessing
              ? (flowProgress && flowProgress.total > 0
                  ? `⚙️ ${flowProgress.progress + 1}/${flowProgress.total} dias...`
                  : '⚙️ Iniciando...')
              : '🚀 Processar Fluxograma'}
          </button>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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
              } else if (node.id === 'simultaneidade') {
                setSimultParams({
                  geff: node.data.simultParams?.geff ?? true,
                  tamb: node.data.simultParams?.tamb ?? true,
                  tcel: node.data.simultParams?.tcel ?? true,
                  energia_pmi: node.data.simultParams?.energia_pmi ?? true,
                  curtailment: node.data.simultParams?.curtailment ?? false,
                  potencia_ppc: node.data.simultParams?.potencia_ppc ?? true,
                  referencia_ppc: node.data.simultParams?.referencia_ppc ?? true,
                  horario_valido_enabled: node.data.simultParams?.horario_valido_enabled ?? false,
                  horario_start: node.data.simultParams?.horario_start ?? "06:00",
                  horario_end: node.data.simultParams?.horario_end ?? "19:00"
                })
              } else if (node.id === 'curtailment') {
                setCurtailmentParams({
                  refMin: node.data.curtailmentRefMin ?? 52.8,
                  refMargin: node.data.curtailmentRefMargin ?? 3,
                  diffMargin: node.data.curtailmentDiffMargin ?? 5,
                  resolutionMode: node.data.resolutionMode ?? '1min'
                })
              } else if (node.data?.aggregator) {
                const rawInputs = node.data.inputs || ['']
                const normalized = rawInputs.map(item => {
                  if (typeof item === 'string') return { series: item, filter: '', sensors: [] }
                  return { sensors: [], ...item }
                })
                setInputsList(normalized)
                setOperation(node.data.operation || 'sum')
                setOutputFilter(node.data.outputFilter || '')
                if (node.id === 'energia_pmi') {
                  setEnergiaPmiParams({
                    multiplier: node.data.energiaPmiParams?.multiplier ?? 0.012,
                    inputType: node.data.energiaPmiParams?.inputType || 'energy_5min',
                    outputUnit: node.data.energiaPmiParams?.outputUnit || 'MW'
                  })
                }
                if (node.id === 'tracker') {
                  setTrackerParams(node.data.trackerParams || { latitude: -23.55, longitude: -46.63, gcr: 0.3, max_angle: 60, tolerance: 10, angulo_defesa: -60, margem_perda_cc: 0 })
                }
                if (node.id === 'sujidade') {
                  setSoilParams({
                    startTime: node.data.startTime || '',
                    endTime: node.data.endTime || '',
                    trimPercent: node.data.trimPercent || ''
                  })
                }
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
      )}

      {/* Modal Bloco Agregador */}
      {selectedBlock && selectedBlock.aggregator && selectedNodeId !== 'epi' && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} 
            onClick={() => setSelectedNodeId(null)} 
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', gap: '16px',
            maxWidth: '95vw', maxHeight: '90vh', zIndex: 1001
          }}>
            <div style={{
              background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', position: 'relative',
              width: '600px', maxWidth: '100%', minHeight: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px', paddingRight: '80px', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                  {getAggregatorDescription(selectedNodeId)}
                </h3>
                {selectedNodeId === 'tracker' && (
                  <div 
                    onClick={() => setShowTrackerParamsInfo(!showTrackerParamsInfo)}
                    title="Informações e Ajuda"
                    style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6A1B9A', fontSize: '14px', background: 'rgba(106, 27, 154, 0.1)', width: '24px', height: '24px', borderRadius: '50%' }}
                  >
                    ℹ️
                  </div>
                )}
              </div>
            {(() => {
              const getBadgeProps = (nodeId) => {
                if (!nodeId) return null;
                if (nodeId.startsWith('gpoa') || nodeId.startsWith('grear') || nodeId.startsWith('geff')) return { label: 'Irradiação', color: '#F9CC00' };
                if (nodeId.startsWith('tmod') || nodeId.startsWith('tamb') || nodeId.startsWith('tcel')) return { label: 'Temperatura', color: '#EF6C00' };
                if (nodeId.startsWith('sujidade')) return { label: 'Sujidade', color: '#6D4C41' };
                if (nodeId.startsWith('tracker')) return { label: 'Tracker', color: '#6A1B9A' };
                if (nodeId.startsWith('energia_pmi')) return { label: 'Energia PMI', color: '#0277BD' };
                if (nodeId.startsWith('referencia_ppc')) return { label: 'Referência PPC', color: '#00838F' };
                if (nodeId.startsWith('potencia_ppc')) return { label: 'Potência PPC', color: '#2E7D32' };
                if (nodeId.startsWith('energia')) return { label: 'Potência', color: '#2E7D32' };
                return null;
              };
              const badge = getBadgeProps(selectedNodeId);
              if (!badge) return null;
              return (
                <div style={{
                  position: 'absolute', top: '24px', right: '24px',
                  background: badge.color, padding: '4px 8px', borderRadius: '4px',
                  fontSize: '11px', fontWeight: 700, color: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 10,
                  letterSpacing: '0.5px'
                }}>
                  {badge.label.toUpperCase()}
                </div>
              );
            })()}
            
            <div style={{ margin: '20px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {(() => {
                const nodeFilteredSeries = allSeries.filter(s => {
                  if (selectedNodeId === 'tmod' || selectedNodeId === 'tamb' || selectedNodeId === 'tcel') return s.elemento === 'Temperatura';
                  if (selectedNodeId === 'gpoa' || selectedNodeId === 'grear' || selectedNodeId === 'geff') return s.elemento === 'Irradiação';
                  if (selectedNodeId === 'tracker') return s.elemento === 'Tracker';
                  if (selectedNodeId === 'sujidade') return s.elemento === 'Sujidade';
                  if (selectedNodeId === 'energia_pmi') return s.elemento === 'Energia PMI';
                  if (selectedNodeId === 'referencia_ppc') return s.elemento === 'Potência CA PPC';
                  if (selectedNodeId === 'potencia_ppc') return s.elemento && s.elemento.startsWith('Potência');
                  return true;
                });
                return (
                  <>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      Selecione as séries de entrada: (Disponíveis: {nodeFilteredSeries?.length || 0})
                    </p>

              {/* Toggle de Operação e Filtro de Saída Final (Oculto se for tracker) */}
              {selectedNodeId !== 'tracker' && (
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
              )}

              {/* Parâmetros do Tracker (PVLIB) e Análise */}
              {selectedNodeId === 'tracker' && (
                <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  
                  {/* Bloco 1: Parâmetros da Curva de Referência */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', background: 'rgba(106, 27, 154, 0.05)', borderRadius: '8px', borderLeft: '4px solid #6A1B9A' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', color: '#6A1B9A' }}>Parâmetros da Curva de Referência (PVLib)</h4>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '120px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Latitude:</label>
                        <input type="number" step="0.0001" className="input" value={trackerParams.latitude} onChange={e => setTrackerParams({ ...trackerParams, latitude: parseFloat(e.target.value) || 0 })} style={{ padding: '6px' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '120px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Longitude:</label>
                        <input type="number" step="0.0001" className="input" value={trackerParams.longitude} onChange={e => setTrackerParams({ ...trackerParams, longitude: parseFloat(e.target.value) || 0 })} style={{ padding: '6px' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '100px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>GCR:</label>
                        <input type="number" step="0.01" className="input" value={trackerParams.gcr} onChange={e => setTrackerParams({ ...trackerParams, gcr: parseFloat(e.target.value) || 0 })} style={{ padding: '6px' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '100px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Ângulo Máx (°):</label>
                        <input type="number" step="1" className="input" value={trackerParams.max_angle} onChange={e => setTrackerParams({ ...trackerParams, max_angle: parseFloat(e.target.value) || 0 })} style={{ padding: '6px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input 
                          type="checkbox" 
                          id="inverterSinal"
                          checked={trackerParams.inverter_sinal || false}
                          onChange={e => setTrackerParams({ ...trackerParams, inverter_sinal: e.target.checked })}
                          style={{ cursor: 'pointer' }}
                        />
                        <label htmlFor="inverterSinal" style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#6A1B9A' }}>
                          Inverter Sinal da Curva (-/+)
                        </label>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#6A1B9A' }}>Avanço/Atraso (min):</label>
                        <input 
                          type="number" 
                          step="1" 
                          className="input" 
                          value={trackerParams.time_offset || 0} 
                          onChange={e => setTrackerParams({ ...trackerParams, time_offset: parseInt(e.target.value) || 0 })} 
                          style={{ padding: '4px 6px', width: '80px', fontSize: '12px' }} 
                          title="Deslocamento temporal da curva teórica em minutos (positivo = curva para frente/atrasada, negativo = curva para trás/adiantada)" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloco 2: Parâmetros Análise dos Trackers */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>Parâmetros Análise dos Trackers</h4>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '100px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Tolerância (°):</label>
                        <input type="number" step="1" className="input" value={trackerParams.tolerance} onChange={e => setTrackerParams({ ...trackerParams, tolerance: parseFloat(e.target.value) || 0 })} style={{ padding: '6px', borderColor: 'var(--red)' }} title="Diferença máxima aceitável em relação à referência." />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Tol. Qtde Pontos Vento:</label>
                        <input type="number" step="1" className="input" value={trackerParams.tol_pontos_vento || 0} onChange={e => setTrackerParams({ ...trackerParams, tol_pontos_vento: parseInt(e.target.value) || 0 })} style={{ padding: '6px' }} title="Qtde máxima de pontos fora da referência para ainda ser considerado Ok." />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>Ângulo de Defesa (°):</label>
                        <input type="number" step="1" className="input" value={trackerParams.angulo_defesa ?? -60} onChange={e => setTrackerParams({ ...trackerParams, angulo_defesa: parseFloat(e.target.value) || 0 })} style={{ padding: '6px', borderColor: 'var(--blue)' }} title="Ângulo fixo alvo para identificar o comando de Vento." />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Tol. Qtde Pontos Travado:</label>
                        <input type="number" step="1" className="input" value={trackerParams.tol_pontos_travado || 0} onChange={e => setTrackerParams({ ...trackerParams, tol_pontos_travado: parseInt(e.target.value) || 0 })} style={{ padding: '6px' }} title="Qtde máxima de pontos fora da referência para ainda ser considerado Ok." />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: '150px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Margem de Perda CC (%):</label>
                        <input type="number" step="1" className="input" value={trackerParams.considerar_ganhos ? 0 : (trackerParams.margem_perda_cc || 0)} disabled={trackerParams.considerar_ganhos} onChange={e => setTrackerParams({ ...trackerParams, margem_perda_cc: parseFloat(e.target.value) || 0 })} style={{ padding: '6px', background: trackerParams.considerar_ganhos ? '#f1f5f9' : 'inherit', color: trackerParams.considerar_ganhos ? '#94a3b8' : 'inherit' }} title="Queda mínima necessária da String em relação à Referência para ser considerada como perda. Padrão: 0. Desabilitado se ganhos forem computados." />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input 
                          type="checkbox" 
                          id="considerarGanhos"
                          checked={trackerParams.considerar_ganhos || false}
                          onChange={e => setTrackerParams({ ...trackerParams, considerar_ganhos: e.target.checked })}
                          style={{ cursor: 'pointer' }}
                        />
                        <label htmlFor="considerarGanhos" style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#047857' }} title="Se habilitado, contabiliza os momentos em que a string supera a referência para abater das perdas. (A Margem de Perda CC será forçada para 0%).">
                          Computar Ganhos CC (-)
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Parâmetros da Sujidade */}
              {selectedNodeId === 'sujidade' && (
                <div style={{ marginBottom: 20, padding: '16px', background: 'rgba(109, 76, 65, 0.06)', borderRadius: '8px', borderLeft: '4px solid #6D4C41', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <h4 style={{ margin: 0, fontSize: '13px', color: '#6D4C41' }}>⏱️ Hora Restrita (opcional)</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Calcula a média apenas dentro do intervalo horário abaixo. Deixe em branco para desativar.</p>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Início (HH:MM):</label>
                      <input
                        type="time"
                        className="input"
                        value={soilParams.startTime}
                        onChange={e => setSoilParams({ ...soilParams, startTime: e.target.value })}
                        style={{ padding: '6px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Fim (HH:MM):</label>
                      <input
                        type="time"
                        className="input"
                        value={soilParams.endTime}
                        onChange={e => setSoilParams({ ...soilParams, endTime: e.target.value })}
                        style={{ padding: '6px' }}
                      />
                    </div>
                  </div>
                  <h4 style={{ margin: '4px 0 0', fontSize: '13px', color: '#6D4C41' }}>✂️ Média Interna — Trim (opcional)</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Descarta os X/2% menores e X/2% maiores antes de calcular a média. Deixe em branco para desativar.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Trim % (ex: 25 para cortar 12,5% de cada lado):</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="input"
                      value={soilParams.trimPercent}
                      onChange={e => setSoilParams({ ...soilParams, trimPercent: e.target.value })}
                      style={{ padding: '6px', maxWidth: '160px' }}
                      placeholder="ex: 25"
                    />
                  </div>
                </div>
              )}
              
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
                        series={nodeFilteredSeries}
                        elementos={elementos}
                        fixedElement={
                          (selectedNodeId === 'tmod' || selectedNodeId === 'tamb' || selectedNodeId === 'tcel') ? 'Temperatura' :
                          (selectedNodeId === 'gpoa' || selectedNodeId === 'grear' || selectedNodeId === 'geff') ? 'Irradiação' :
                          (selectedNodeId === 'tracker') ? 'Tracker' :
                          (selectedNodeId === 'sujidade') ? 'Sujidade' :
                          (selectedNodeId === 'energia_pmi') ? 'Energia PMI' : ''
                        }
                      />
                    </div>
                    <div style={{ flex: 2 }}>
                      {selectedNodeId === 'tracker' ? (
                        <div style={{ position: 'relative' }}>
                          <details style={{ position: 'relative' }}>
                            <summary style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer', listStyle: 'none' }}>
                              {val.sensors && val.sensors.length > 0 ? `${val.sensors.length} sensor(es)` : 'Selecionar Sensores...'}
                            </summary>
                            <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '350px', background: 'var(--bg-card)', border: '1px solid var(--border)', maxHeight: '250px', overflowY: 'auto', zIndex: 100, padding: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                              {availableIrradianceSensors.map(sensor => {
                                const isSelectedByMe = (val.sensors || []).includes(sensor.name);
                                const isSelectedByOther = inputsList.some((otherVal, otherIdx) => otherIdx !== idx && (otherVal.sensors || []).includes(sensor.name));
                                return (
                                <label key={sensor.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', marginBottom: '4px', cursor: isSelectedByOther ? 'not-allowed' : 'pointer', opacity: isSelectedByOther ? 0.5 : 1 }}>
                                  <input type="checkbox" checked={isSelectedByMe} disabled={isSelectedByOther} onChange={(e) => {
                                    const checked = e.target.checked;
                                    const newList = [...inputsList];
                                    const currentSensors = newList[idx].sensors || [];
                                    newList[idx] = { 
                                      ...newList[idx], 
                                      sensors: checked ? [...currentSensors, sensor.name] : currentSensors.filter(s => s !== sensor.name) 
                                    };
                                    setInputsList(newList);
                                  }} />
                                  <span style={{ 
                                    background: sensor.source === 'Gpoa' ? '#F9CC00' : '#FF9800', 
                                    color: '#000', 
                                    padding: '2px 4px', 
                                    borderRadius: '4px', 
                                    fontSize: '9px', 
                                    fontWeight: 'bold',
                                    minWidth: '40px',
                                    textAlign: 'center'
                                  }}>
                                    {sensor.source}
                                  </span>
                                  {sensor.name}
                                  {isSelectedByOther && <span style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginLeft: '4px' }}>(em uso)</span>}
                                </label>
                                );
                              })}
                              {availableIrradianceSensors.length === 0 && <span style={{fontSize:'11px', color:'var(--text-muted)'}}>Nenhum sensor em Gpoa/Grear</span>}
                            </div>
                          </details>
                        </div>
                      ) : (() => {
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
                onClick={() => setInputsList([...inputsList, { series: '', filter: '', sensors: [] }])}
                style={{ marginTop: '12px', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-primary)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', width: '100%' }}
              >
                + Adicionar outra entrada
              </button>

              {selectedNodeId === 'energia_pmi' && (
                <div style={{ marginTop: '20px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Resolução da Entrada Bruta:</label>
                      <select 
                        className="select" 
                        style={{ width: '220px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }}
                        value={energiaPmiParams.inputType || 'energy_5min'}
                        onChange={e => setEnergiaPmiParams({ ...energiaPmiParams, inputType: e.target.value })}
                      >
                        <option value="energy_5min">Energia (kWh) a cada 5 min</option>
                        <option value="power_1min">Potência (kW) a cada 1 min</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Unidade da Série Processada:</label>
                      <select 
                        className="select" 
                        style={{ width: '220px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }}
                        value={energiaPmiParams.outputUnit || 'MW'}
                        onChange={e => setEnergiaPmiParams({ ...energiaPmiParams, outputUnit: e.target.value })}
                      >
                        <option value="MW">MegaWatts (MW)</option>
                        <option value="kW">KiloWatts (kW)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Fator de Conversão (Multiplicador):</label>
                      <input 
                        type="number" step="0.001" className="input" 
                        style={{ width: '120px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }} 
                        value={energiaPmiParams.multiplier} 
                        onChange={e => setEnergiaPmiParams({ ...energiaPmiParams, multiplier: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, marginBottom: 0 }}>
                    Usado para converter os dados originais na unidade selecionada acima.
                  </p>
                </div>
              )}

              </>
              );
              })()}
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
                      const newData = { ...n.data, inputs: inputsList, operation: operation, outputFilter: outputFilter }
                      if (n.id === 'tracker') {
                        newData.trackerParams = trackerParams;
                      }
                      if (n.id === 'sujidade') {
                        newData.startTime = soilParams.startTime || '';
                        newData.endTime = soilParams.endTime || '';
                        newData.trimPercent = soilParams.trimPercent || '';
                      }
                      if (n.id === 'energia_pmi') {
                        newData.energiaPmiParams = energiaPmiParams;
                      }
                      return { ...n, data: newData }
                    }
                    return n
                  })
                  setNodes(updatedNodes)
                  saveNodeConfig(updatedNodes)
                  setSelectedNodeId(null)
                }} 
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--amber)', color: '#000' }}
              >
                Salvar
              </button>
            </div>
          </div>

          {/* Painel lateral de Informações */}
          {selectedNodeId === 'tracker' && showTrackerParamsInfo && (
            <div style={{
              background: 'var(--bg-card)', padding: '24px', borderRadius: '8px',
              width: '360px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Informações</h3>
                <button onClick={() => setShowTrackerParamsInfo(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>✕</button>
              </div>
              
              <h5 style={{ margin: '0 0 12px 0', color: '#6A1B9A', fontSize: '14px' }}>Dicionário de Parâmetros da Curva de Referência (PVLib)</h5>
              <ul style={{ margin: '0 0 24px 0', paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li style={{ marginBottom: '6px' }}><strong>Latitude/Longitude:</strong> Coordenadas da usina para o cálculo preciso da posição do sol (PVLib).</li>
                <li style={{ marginBottom: '6px' }}><strong>GCR:</strong> Razão de cobertura do solo. Usado para modelar sombreamento entre fileiras (backtracking).</li>
                <li style={{ marginBottom: '6px' }}><strong>Ângulo Máx:</strong> Rotação física máxima permitida pelo rastreador (ex: 60°).</li>
                <li style={{ marginBottom: '6px' }}><strong>Inverter Sinal:</strong> Corrige leitura invertida do sensor em relação à referência.</li>
                <li><strong>Avanço/Atraso:</strong> Compensa atrasos temporais no relógio do datalogger.</li>
              </ul>

              <h5 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: '14px' }}>Dicionário de Parâmetros Análise dos Trackers</h5>
              <ul style={{ margin: '0 0 24px 0', paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li style={{ marginBottom: '6px' }}><strong>Tolerância (°):</strong> Diferença angular aceitável entre o medido e o ideal teórico.</li>
                <li style={{ marginBottom: '6px' }}><strong>Tol. Qtde Pontos Vento:</strong> Quantidade de pontos consecutivos fora da curva para alarmes de vento.</li>
                <li style={{ marginBottom: '6px' }}><strong>Ângulo de Defesa (°):</strong> Ângulo fixo alvo para identificar o comando de Vento.</li>
                <li style={{ marginBottom: '6px' }}><strong>Tol. Qtde Pontos Travado:</strong> Quantidade de pontos consecutivos fora da curva para alarmes de falha/travado.</li>
                <li style={{ marginBottom: '6px' }}><strong>Margem de Perda CC (%):</strong> Percentual mínimo de queda da string em relação à referência para registrar perda. Desabilitado caso Ganhos CC sejam computados.</li>
                <li><strong>Computar Ganhos CC (-):</strong> Se habilitado, a diferença negativa (quando a string ganha da média) também é contabilizada, abatendo no valor da perda. Força a Margem de Perda CC para 0%.</li>
              </ul>

              <h5 style={{ margin: '0 0 12px 0', color: '#6A1B9A', fontSize: '14px' }}>Como adicionar sensores?</h5>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Para associar sensores a um tracker, você deve primeiro adicionar as séries de irradiação nos blocos <strong>Gpoa (Irradiância Plano Array)</strong> e <strong>Grear (Irradiância Traseira)</strong> do fluxograma. 
                <br/><br/>
                Os sensores inseridos lá aparecerão automaticamente na lista deste bloco Tracker para serem selecionados.
              </p>
            </div>
          )}

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
            <h3 style={{ marginTop: 0, color: '#eab308', borderBottom: '1px solid var(--border)', paddingBottom: '12px', paddingRight: '80px' }}>
              G<sub>eff</sub> - Irradiância Efetiva
            </h3>
            {(() => {
              const getBadgeProps = (nodeId) => {
                if (!nodeId) return null;
                if (nodeId.startsWith('gpoa') || nodeId.startsWith('grear') || nodeId.startsWith('geff')) return { label: 'Irradiação', color: '#F9CC00' };
                if (nodeId.startsWith('tmod') || nodeId.startsWith('tamb') || nodeId.startsWith('tcel')) return { label: 'Temperatura', color: '#EF6C00' };
                if (nodeId.startsWith('sujidade')) return { label: 'Sujidade', color: '#6D4C41' };
                if (nodeId.startsWith('tracker')) return { label: 'Tracker', color: '#6A1B9A' };
                if (nodeId.startsWith('energia_pmi')) return { label: 'Energia PMI', color: '#0277BD' };
                if (nodeId.startsWith('referencia_ppc')) return { label: 'Referência PPC', color: '#00838F' };
                if (nodeId.startsWith('potencia_ppc')) return { label: 'Potência PPC', color: '#2E7D32' };
                if (nodeId.startsWith('energia')) return { label: 'Potência', color: '#2E7D32' };
                return null;
              };
              const badge = getBadgeProps(selectedNodeId);
              if (!badge) return null;
              return (
                <div style={{
                  position: 'absolute', top: '24px', right: '24px',
                  background: badge.color, padding: '4px 8px', borderRadius: '4px',
                  fontSize: '11px', fontWeight: 700, color: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 10,
                  letterSpacing: '0.5px'
                }}>
                  {badge.label.toUpperCase()}
                </div>
              );
            })()}
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(234,179,8,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #eab308' }}>
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
                  saveNodeConfig(updatedNodes)
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
            <h3 style={{ marginTop: 0, color: '#f97316', borderBottom: '1px solid var(--border)', paddingBottom: '12px', paddingRight: '80px' }}>
              T<sub>cel</sub> - Temperatura da Célula
            </h3>
            {(() => {
              const getBadgeProps = (nodeId) => {
                if (!nodeId) return null;
                if (nodeId.startsWith('gpoa') || nodeId.startsWith('grear') || nodeId.startsWith('geff')) return { label: 'Irradiação', color: '#F9CC00' };
                if (nodeId.startsWith('tmod') || nodeId.startsWith('tamb') || nodeId.startsWith('tcel')) return { label: 'Temperatura', color: '#EF6C00' };
                if (nodeId.startsWith('sujidade')) return { label: 'Sujidade', color: '#6D4C41' };
                if (nodeId.startsWith('tracker')) return { label: 'Tracker', color: '#6A1B9A' };
                if (nodeId.startsWith('energia_pmi')) return { label: 'Energia PMI', color: '#0277BD' };
                if (nodeId.startsWith('referencia_ppc')) return { label: 'Referência PPC', color: '#00838F' };
                if (nodeId.startsWith('potencia_ppc')) return { label: 'Potência PPC', color: '#2E7D32' };
                if (nodeId.startsWith('energia')) return { label: 'Potência', color: '#2E7D32' };
                return null;
              };
              const badge = getBadgeProps(selectedNodeId);
              if (!badge) return null;
              return (
                <div style={{
                  position: 'absolute', top: '24px', right: '24px',
                  background: badge.color, padding: '4px 8px', borderRadius: '4px',
                  fontSize: '11px', fontWeight: 700, color: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 10,
                  letterSpacing: '0.5px'
                }}>
                  {badge.label.toUpperCase()}
                </div>
              );
            })()}
            
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
      {/* Modal Bloco Curtailment */}
      {selectedNodeId === 'curtailment' && (
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
            <h3 style={{ marginTop: 0, color: '#b91c1c', borderBottom: '1px solid var(--border)', paddingBottom: '12px', paddingRight: '80px' }}>
              Filtro de Curtailment
            </h3>
            
            <div style={{
              position: 'absolute', top: '24px', right: '24px',
              background: '#ef4444', padding: '4px 8px', borderRadius: '4px',
              fontSize: '11px', fontWeight: 700, color: '#fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 10,
              letterSpacing: '0.5px'
            }}>
              CURTAILMENT
            </div>
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(239,68,68,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #ef4444' }}>
                Define os parâmetros para detectar quando houve limitação de potência (curtailment) imposta pela rede que afetou de fato a usina.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Campo 1: Ref. Mínima */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Ref. Mínima de Potência (MW)</label>
                    <div style={{ position: 'relative', display: 'inline-flex' }} className="info-badge-wrap">
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 18, height: 18, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                        background: '#3b82f6', color: '#fff', cursor: 'help', flexShrink: 0, userSelect: 'none'
                      }}>ⓘ</span>
                      <div style={{
                        display: 'none', position: 'absolute', bottom: '125%', left: '50%', transform: 'translateX(-50%)',
                        background: '#1e293b', color: '#e2e8f0', padding: '10px 14px', borderRadius: 8,
                        fontSize: 12, lineHeight: 1.6, width: 280, zIndex: 999,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)', pointerEvents: 'none',
                        whiteSpace: 'normal'
                      }} className="info-tooltip">
                        <strong style={{ color: '#93c5fd' }}>🎯 Gatilho 1 — Limite de Referência PPC</strong><br/>
                        Valor em MW abaixo do qual a Referência PPC enviada pela rede é considerada um sinal de limitação de potência.<br/><br/>
                        <strong style={{ color: '#fbbf24' }}>Impacto:</strong> Se a Ref. PPC estiver abaixo desse limiar (descontada a margem de segurança), o gatilho 1 é ativado.
                        <br/><br/><em style={{ color: '#94a3b8' }}>Ex: 52,8 MW = potência nominal da usina.</em>
                      </div>
                    </div>
                  </div>
                  <input
                    type="number" step="0.1" className="input"
                    value={curtailmentParams.refMin}
                    onChange={e => setCurtailmentParams({ ...curtailmentParams, refMin: parseFloat(e.target.value) || 0 })}
                    placeholder="ex: 52.8"
                  />
                </div>

                {/* Campo 2: Margem de Segurança */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Margem de Segurança da Ref. (%)</label>
                    <div style={{ position: 'relative', display: 'inline-flex' }} className="info-badge-wrap">
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 18, height: 18, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                        background: '#3b82f6', color: '#fff', cursor: 'help', flexShrink: 0, userSelect: 'none'
                      }}>ⓘ</span>
                      <div style={{
                        display: 'none', position: 'absolute', bottom: '125%', left: '50%', transform: 'translateX(-50%)',
                        background: '#1e293b', color: '#e2e8f0', padding: '10px 14px', borderRadius: 8,
                        fontSize: 12, lineHeight: 1.6, width: 290, zIndex: 999,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)', pointerEvents: 'none',
                        whiteSpace: 'normal'
                      }} className="info-tooltip">
                        <strong style={{ color: '#93c5fd' }}>🛡️ Margem de Tolerância do Gatilho 1</strong><br/>
                        Percentual subtraído da Ref. Mínima para criar uma faixa de segurança. O limiar efetivo do gatilho 1 será:<br/>
                        <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4, color: '#86efac' }}>Limiar = Ref.Mín × (1 − Margem%)</code><br/><br/>
                        <strong style={{ color: '#fbbf24' }}>Impacto:</strong> Evita falsos positivos quando a Ref. PPC oscila levemente abaixo do nominal.<br/><br/>
                        <em style={{ color: '#94a3b8' }}>Ex: Ref.Mín=52,8 e Margem=2% → Limiar=51,74 MW.</em>
                      </div>
                    </div>
                  </div>
                  <input
                    type="number" step="0.1" className="input"
                    value={curtailmentParams.refMargin}
                    onChange={e => setCurtailmentParams({ ...curtailmentParams, refMargin: parseFloat(e.target.value) || 0 })}
                    placeholder="ex: 2"
                  />
                </div>

                {/* Campo 3: Tolerância de Geração */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Tolerância (Geração Real vs Ref.) (%)</label>
                    <div style={{ position: 'relative', display: 'inline-flex' }} className="info-badge-wrap">
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 18, height: 18, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                        background: '#3b82f6', color: '#fff', cursor: 'help', flexShrink: 0, userSelect: 'none'
                      }}>ⓘ</span>
                      <div style={{
                        display: 'none', position: 'absolute', bottom: '125%', right: 0,
                        background: '#1e293b', color: '#e2e8f0', padding: '10px 14px', borderRadius: 8,
                        fontSize: 12, lineHeight: 1.6, width: 300, zIndex: 999,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)', pointerEvents: 'none',
                        whiteSpace: 'normal'
                      }} className="info-tooltip">
                        <strong style={{ color: '#93c5fd' }}>⚖️ Gatilho 2 — Aderência à Referência</strong><br/>
                        Define a banda de tolerância em torno da Ref. PPC dentro da qual a geração real deve estar para confirmar que a usina está de fato seguindo o sinal de curtailment:<br/>
                        <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4, color: '#86efac' }}>|Real − Ref| ≤ Ref × Tol%</code><br/><br/>
                        <strong style={{ color: '#fbbf24' }}>Impacto:</strong> Se a geração real estiver fora dessa banda (muito acima ou muito abaixo da referência), o curtailment <em>não</em> é confirmado, pois a usina não está seguindo o sinal.<br/><br/>
                        <em style={{ color: '#94a3b8' }}>Ex: Ref=40 MW e Tol=5% → banda de ±2 MW (38–42 MW). Real=50 MW → sem curtailment.</em>
                      </div>
                    </div>
                  </div>
                  <input
                    type="number" step="0.1" className="input"
                    value={curtailmentParams.diffMargin}
                    onChange={e => setCurtailmentParams({ ...curtailmentParams, diffMargin: parseFloat(e.target.value) || 0 })}
                    placeholder="ex: 5"
                  />
                </div>

                {/* Campo 4: Resolução */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Resolução da Avaliação</label>
                  </div>
                  <select
                    className="select select-bordered"
                    value={curtailmentParams.resolutionMode}
                    onChange={e => setCurtailmentParams({ ...curtailmentParams, resolutionMode: e.target.value })}
                  >
                    <option value="1min">1 minuto</option>
                    <option value="15min">15 minutos</option>
                  </select>
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
                      return { 
                        ...n, 
                        data: { 
                          ...n.data, 
                          curtailmentRefMin: curtailmentParams.refMin,
                          curtailmentRefMargin: curtailmentParams.refMargin,
                          curtailmentDiffMargin: curtailmentParams.diffMargin,
                          resolutionMode: curtailmentParams.resolutionMode
                        } 
                      }
                    }
                    return n
                  })
                  setNodes(updatedNodes)
                  saveNodeConfig(updatedNodes)
                  setSelectedNodeId(null)
                }} 
                className="btn btn-primary btn-sm"
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal Bloco Simultaneidade */}
      {selectedNodeId === 'simultaneidade' && (
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
            <h3 style={{ marginTop: 0, color: '#64748b', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              Dados Válidos
            </h3>
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(100,116,139,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #64748b' }}>
                Este bloco verifica se existem dados válidos para <strong>todas</strong> as séries selecionadas abaixo, em cada minuto.<br/><br/>
                Se todas existirem, gera <strong>Flag = 1</strong>. Caso falte alguma, gera <strong>Flag = 0</strong>.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const renderCard = (key, label, colorType) => {
                    const isChecked = simultParams[key]
                    let bg = '#fff', border = '#ccc'
                    switch(colorType) {
                      case 'yellow': bg = isChecked ? '#fef08a' : '#fef9c3'; border = isChecked ? '#facc15' : '#fef08a'; break;
                      case 'orange': bg = isChecked ? '#ffedd5' : '#fff7ed'; border = isChecked ? '#f97316' : '#ffedd5'; break;
                      case 'green': bg = isChecked ? '#bbf7d0' : '#dcfce7'; border = isChecked ? '#4ade80' : '#bbf7d0'; break;
                      case 'blue': bg = isChecked ? '#bae6fd' : '#e0f2fe'; border = isChecked ? '#38bdf8' : '#bae6fd'; break;
                    }
                    return (
                      <div 
                        key={key}
                        onClick={() => setSimultParams({...simultParams, [key]: !isChecked})}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          background: bg, border: `2px solid ${border}`,
                          borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                          opacity: isChecked ? 1 : 0.6
                        }}
                      >
                        <input type="checkbox" checked={isChecked} readOnly style={{ width: 16, height: 16, cursor: 'pointer' }} />
                        <span style={{ fontSize: 13, fontWeight: isChecked ? 600 : 400, color: '#334155' }} dangerouslySetInnerHTML={{ __html: label }} />
                      </div>
                    )
                  }
                  return (
                    <>
                      <h4 style={{ margin: '5px 0 5px 0', fontSize: 13, color: '#475569', fontWeight: 600 }}>Simultaneidade</h4>
                      {renderCard('geff', 'G<sub>eff</sub> (Irradiância Efetiva)', 'yellow')}
                      {renderCard('tamb', 'T<sub>amb</sub> (Temperatura Ambiente)', 'orange')}
                      {renderCard('tcel', 'T<sub>cel</sub> (Temperatura da Célula)', 'orange')}
                      
                      <h4 style={{ margin: '10px 0 5px 0', fontSize: 13, color: '#475569', fontWeight: 600 }}>Curtailment</h4>
                      {renderCard('curtailment', 'Filtro de Curtailment', 'orange')}

                      <h4 style={{ margin: '10px 0 5px 0', fontSize: 13, color: '#475569', fontWeight: 600 }}>Avaliação de Blocos (Agrupamento Final)</h4>
                      {renderCard('energia_pmi', 'Forçar cortes em blocos de 5 min (Energia PMI)', 'blue')}

                      <h4 style={{ margin: '10px 0 5px 0', fontSize: 13, color: '#475569', fontWeight: 600 }}>Filtro de Horário</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: simultParams.horario_valido_enabled ? '#f0fdf4' : '#fff', border: `2px solid ${simultParams.horario_valido_enabled ? '#4ade80' : '#ccc'}`, borderRadius: '8px', padding: '10px 14px', transition: 'all 0.2s', opacity: simultParams.horario_valido_enabled ? 1 : 0.6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setSimultParams({...simultParams, horario_valido_enabled: !simultParams.horario_valido_enabled})}>
                          <input type="checkbox" checked={simultParams.horario_valido_enabled} readOnly style={{ width: 16, height: 16, cursor: 'pointer' }} />
                          <span style={{ fontSize: 13, fontWeight: simultParams.horario_valido_enabled ? 600 : 400, color: '#334155' }}>Habilitar filtro de Horário Válido</span>
                        </div>
                        {simultParams.horario_valido_enabled && (
                          <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <label style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>Horário Inicial</label>
                              <input type="time" value={simultParams.horario_start} onChange={(e) => setSimultParams({...simultParams, horario_start: e.target.value})} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <label style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>Horário Final</label>
                              <input type="time" value={simultParams.horario_end} onChange={(e) => setSimultParams({...simultParams, horario_end: e.target.value})} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}
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
                      return { ...n, data: { ...n.data, simultParams } }
                    }
                    return n
                  })
                  setNodes(updatedNodes)
                  saveNodeConfig(updatedNodes)
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

      {/* Modal Bloco PVLib */}
      {selectedNodeId === 'pvlib' && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} 
            onClick={() => setSelectedNodeId(null)} 
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', gap: '16px',
            maxWidth: '95vw', maxHeight: '90vh', zIndex: 1001
          }}>
            <div style={{
              background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', position: 'relative',
              width: '800px', maxWidth: '100%', minHeight: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column'
            }}>
            <h3 style={{ marginTop: 0, color: '#0ea5e9', borderBottom: '1px solid var(--border)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#0ea5e9', letterSpacing: '-1px' }}>PV<span style={{fontWeight: 300}}>lib</span></span>
                <span style={{ color: 'var(--text-primary)', fontSize: '18px' }}>Simulação Física (Python)</span>
                
                <div 
                  onClick={() => setShowPvlibInstructions(!showPvlibInstructions)}
                  title="Instruções"
                  style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0ea5e9', fontSize: '14px', background: 'rgba(14, 165, 233, 0.1)', width: '24px', height: '24px', borderRadius: '50%' }}
                >
                  📝
                </div>
                <div 
                  onClick={() => setShowPvlibParamsInfo(!showPvlibParamsInfo)}
                  title="Informações e Ajuda"
                  style={{ marginLeft: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0ea5e9', fontSize: '14px', background: 'rgba(14, 165, 233, 0.1)', width: '24px', height: '24px', borderRadius: '50%' }}
                >
                  ℹ️
                </div>
              </div>
              <button onClick={() => setSelectedNodeId(null)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </h3>
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Configure os parâmetros para simular a usina utilizando o modelo físico da biblioteca PVlib.
                </p>
                <button 
                  className="btn" 
                  style={{ background: 'var(--bg-secondary)', color: '#0ea5e9', border: '1px solid #0ea5e9', padding: '6px 12px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    setPvlibParams(prev => ({
                      ...prev,
                      latitude: trackerParams?.latitude || 0,
                      longitude: trackerParams?.longitude || 0,
                      gcr: trackerParams?.gcr || 0
                    }))
                    setToast({ message: 'Parâmetros importados do Tracker.', type: 'success' })
                  }}
                  title="Importa Latitude, Longitude e GCR do bloco Tracker ativo."
                >
                  🔄 Importar do Tracker
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                
                {/* Location */}
                <div style={{ background: 'rgba(14, 165, 233, 0.05)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #0ea5e9' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#0ea5e9', fontSize: '14px' }}>Localização e Parâmetros</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Latitude:</label>
                      <input type="number" step="0.0001" className="input" value={pvlibParams.latitude} onChange={e => setPvlibParams({...pvlibParams, latitude: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Longitude:</label>
                      <input type="number" step="0.0001" className="input" value={pvlibParams.longitude} onChange={e => setPvlibParams({...pvlibParams, longitude: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Altitude (m):</label>
                      <input type="number" className="input" value={pvlibParams.altitude} onChange={e => setPvlibParams({...pvlibParams, altitude: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>GCR (Tracker):</label>
                      <input type="number" step="0.01" className="input" value={pvlibParams.gcr ?? ''} onChange={e => setPvlibParams({...pvlibParams, gcr: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Declive Terreno (°):</label>
                      <input type="number" step="0.01" className="input" value={pvlibParams.axis_tilt ?? 0} onChange={e => setPvlibParams({...pvlibParams, axis_tilt: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Fuso Horário:</label>
                      <input type="text" className="input" value={pvlibParams.tz} onChange={e => setPvlibParams({...pvlibParams, tz: e.target.value})} />
                    </div>
                  </div>
                </div>

                {/* Module Selector */}
                <div style={{ background: 'rgba(14, 165, 233, 0.05)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #0ea5e9' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#0ea5e9', fontSize: '14px' }}>Módulos da Usina</h4>
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Selecione os módulos presentes na usina (buscados do Cadastro). A topologia exata será obtida do Infos Usina.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                    {equipamentos.modulos.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum módulo cadastrado.</span>}
                    {equipamentos.modulos.map(m => (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 13, cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={(pvlibParams.selected_modulos || []).includes(m.id)}
                          onChange={e => {
                            const sel = pvlibParams.selected_modulos || [];
                            if (e.target.checked) setPvlibParams({...pvlibParams, selected_modulos: [...sel, m.id]});
                            else setPvlibParams({...pvlibParams, selected_modulos: sel.filter(id => id !== m.id)});
                          }}
                        />
                        {m.nome} ({m.potencia}W)
                      </label>
                    ))}
                  </div>
                </div>

                {/* Inverter Selector */}
                <div style={{ background: 'rgba(14, 165, 233, 0.05)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #0ea5e9' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#0ea5e9', fontSize: '14px' }}>Inversores da Usina</h4>
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Selecione os inversores presentes na usina.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                    {equipamentos.inversores.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>Nenhum inversor cadastrado.</span>}
                    {equipamentos.inversores.map(m => (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 13, cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={(pvlibParams.selected_inversores || []).includes(m.id)}
                          onChange={e => {
                            const sel = pvlibParams.selected_inversores || [];
                            if (e.target.checked) setPvlibParams({...pvlibParams, selected_inversores: [...sel, m.id]});
                            else setPvlibParams({...pvlibParams, selected_inversores: sel.filter(id => id !== m.id)});
                          }}
                        />
                        {m.nome} ({(m.paco/1000).toFixed(1)}kW)
                      </label>
                    ))}
                  </div>
                </div>
                
                {/* Losses */}
                <div style={{ background: 'rgba(14, 165, 233, 0.05)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #0ea5e9' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#0ea5e9', fontSize: '14px' }}>Perdas e Fatores de Correção</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Ohm Loss DC (%):</label>
                      <input type="number" step="0.001" className="input" value={pvlibParams.loss_ohm_dc} onChange={e => setPvlibParams({...pvlibParams, loss_ohm_dc: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Perda Cabeamento BT CA (%):</label>
                      <input type="number" step="0.001" className="input" value={pvlibParams.loss_ohm_ac} onChange={e => setPvlibParams({...pvlibParams, loss_ohm_ac: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Mismatch (%):</label>
                      <input type="number" step="0.1" className="input" value={pvlibParams.mismatch || 0} onChange={e => setPvlibParams({...pvlibParams, mismatch: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>LID (%):</label>
                      <input type="number" step="0.1" className="input" value={pvlibParams.lid || 0} onChange={e => setPvlibParams({...pvlibParams, lid: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Perdas Auxiliares (kW):</label>
                      <input type="number" step="0.1" className="input" value={pvlibParams.aux_loss || 0} onChange={e => setPvlibParams({...pvlibParams, aux_loss: parseFloat(e.target.value)||0})} />
                    </div>
                  </div>
                </div>

                {/* Soiling Configuration */}
                <div style={{ background: 'rgba(236, 72, 153, 0.05)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ec4899', marginTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#ec4899', fontSize: '14px' }}>Sujidade (Soiling)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                        <input 
                          type="radio" 
                          name="soiling_mode"
                          checked={!pvlibParams.use_fixed_soiling} 
                          onChange={() => setPvlibParams({...pvlibParams, use_fixed_soiling: false})}
                        />
                        Usar Sujidade Medida (Calculada)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                        <input 
                          type="radio" 
                          name="soiling_mode"
                          checked={pvlibParams.use_fixed_soiling} 
                          onChange={() => setPvlibParams({...pvlibParams, use_fixed_soiling: true, fixed_soiling_pct: pvlibParams.fixed_soiling_pct ?? 1.0})}
                        />
                        Definir Sujidade Fixa
                      </label>
                    </div>
                    {pvlibParams.use_fixed_soiling && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '200px', marginTop: '8px' }}>
                        <label style={{ fontSize: 12, fontWeight: 600 }}>Sujidade Fixa (%):</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="input" 
                          value={pvlibParams.fixed_soiling_pct ?? 1.0} 
                          onChange={e => setPvlibParams({...pvlibParams, fixed_soiling_pct: parseFloat(e.target.value) || 0})} 
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Transformer & MV Losses */}
                <div style={{ background: 'rgba(234, 179, 8, 0.05)', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #eab308', marginTop: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#eab308', fontSize: '14px' }}>Transformador e Média Tensão</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Potência Nominal Trafo (kVA):</label>
                      <input type="number" step="1" className="input" value={pvlibParams.trafo_pnom || 0} onChange={e => setPvlibParams({...pvlibParams, trafo_pnom: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Perdas de Ferro (%):</label>
                      <input type="number" step="0.001" className="input" value={pvlibParams.trafo_iron_loss || 0} onChange={e => setPvlibParams({...pvlibParams, trafo_iron_loss: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Perdas de Cobre (%):</label>
                      <input type="number" step="0.001" className="input" value={pvlibParams.trafo_copper_loss || 0} onChange={e => setPvlibParams({...pvlibParams, trafo_copper_loss: parseFloat(e.target.value)||0})} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Perda Cabeamento MT CA (%):</label>
                      <input type="number" step="0.001" className="input" value={pvlibParams.loss_ohm_ac_mt || 0} onChange={e => setPvlibParams({...pvlibParams, loss_ohm_ac_mt: parseFloat(e.target.value)||0})} />
                    </div>
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button 
                  className="btn"
                  style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => {
                    const updatedNodes = nodes.map(n => {
                      if (n.id === 'pvlib') {
                        return { ...n, data: { ...n.data, pvlibParams } }
                      }
                      return n
                    })
                    setNodes(updatedNodes)
                    saveNodeConfig(updatedNodes)
                    setToast({ message: 'Parâmetros PVLib salvos com sucesso.', type: 'success' })
                    setSelectedNodeId(null);
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>

          {/* Painel lateral de Instruções */}
          {selectedNodeId === 'pvlib' && showPvlibInstructions && (
            <div style={{
              background: 'var(--bg-card)', padding: '24px', borderRadius: '8px',
              width: '360px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Instruções</h3>
                <button onClick={() => setShowPvlibInstructions(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>✕</button>
              </div>
              <ul style={{ margin: '0 0 24px 0', paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li style={{ marginBottom: '6px' }}><strong>Latitude / Longitude:</strong> Coordenadas da usina usadas para calcular a posição solar exata.</li>
                <li style={{ marginBottom: '6px' }}><strong>Altitude (m):</strong> Afeta a pressão atmosférica e a atenuação da luz solar (Massa de Ar) usada pelo modelo DIRINT.</li>
                <li style={{ marginBottom: '6px' }}><strong>GCR:</strong> Razão de Cobertura do Solo. Usado pelo rastreador virtual do PVLib para simular sombreamento (backtracking).</li>
                <li style={{ marginBottom: '6px' }}><strong>Fuso Horário:</strong> Crucial para converter os timestamps do banco para hora solar verdadeira. Um fuso errado desloca o sol e distorce a separação DIRINT.</li>
                <li style={{ marginBottom: '6px' }}><strong>Módulos / Inversores:</strong> Selecione os equipamentos da usina para carregar a matriz PAN/OND e aplicar as curvas de eficiência e perdas IAM/Shunt.</li>
                <li style={{ marginBottom: '6px' }}><strong>Ohm Loss DC / AC (%):</strong> Perda fracional de resistência ôhmica nos cabeamentos DC das strings e cabos AC até o medidor.</li>
                <li style={{ marginBottom: '6px' }}><strong>Mismatch (%):</strong> Perda estimada pela dispersão natural das características elétricas (I-V) entre módulos na mesma string.</li>
                <li style={{ marginBottom: '6px' }}><strong>LID (%):</strong> Degradação Induzida por Luz inicial. Fator fixo de perda abatido da potência bruta.</li>
                <li style={{ marginBottom: '6px' }}><strong>Perdas Aux. (kW):</strong> Consumo fixo contínuo dos inversores e transformadores (refrigeração/eletrônica).</li>
              </ul>
            </div>
          )}

          {/* Painel lateral de Informações */}
          {selectedNodeId === 'pvlib' && showPvlibParamsInfo && (
            <div style={{
              background: 'var(--bg-card)', padding: '24px', borderRadius: '8px',
              width: '360px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Informações</h3>
                <button onClick={() => setShowPvlibParamsInfo(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>✕</button>
              </div>
              <h5 style={{ margin: '0 0 12px 0', color: '#0ea5e9', fontSize: '14px' }}>Divergências PVSyst x PVLib</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong>1. Separação DIRINT:</strong> O PVLib tende a superestimar luz Direta no meio da manhã/tarde, gerando menos perdas óticas globais.<br/><br/>
                <strong>2. Integração IAM Difuso:</strong> O PVLib usa Marion (toda a abóbada), resultando num fator difuso mais otimista que a aproximação padrão do PVSyst.<br/><br/>
                <strong>3. Resistência Shunt:</strong> A queda exponencial da Shunt sob baixa luz é frequentemente mais agressiva na caixa-preta do PVSyst do que nas equações do DeSoto/PVLib.
              </p>
            </div>
          )}
          </div>
        </>
      )}

      {/* Modal Bloco PVSyst */}
      {selectedNodeId === 'pvsyst' && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} 
            onClick={() => setSelectedNodeId(null)} 
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', zIndex: 1001,
            width: '500px', maxWidth: '90vw', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ marginTop: 0, color: '#233772', borderBottom: '1px solid var(--border)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src="/pvsyst.png" alt="PVSyst Logo" style={{ height: '24px', objectFit: 'contain' }} />
                <span>Simulação PVSyst</span>
              </div>
              <button onClick={() => setSelectedNodeId(null)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </h3>
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                Nesta etapa, você pode exportar as séries filtradas para uso no software PVSYST, ou carregar os resultados de uma simulação já realizada.
              </p>
              
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '10px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button 
                    disabled={isExporting}
                    onClick={async () => {
                      if (isExporting) return;
                      try {
                        setIsExporting(true);
                        setExportProgress(0);
                        const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                        
                        // Inicia a exportação
                        const startRes = await fetch(`${baseUrl}/flow/${encodeURIComponent(usinaAtual)}/export-pvsyst/start`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dates: selectedDates })
                        });
                        
                        if (!startRes.ok) throw new Error("Erro ao iniciar exportação");
                        const startData = await startRes.json();
                        const taskId = startData.task_id;
                        
                        // Polling para checar status
                        const interval = setInterval(async () => {
                          try {
                            const statusRes = await fetch(`${baseUrl}/flow/${encodeURIComponent(usinaAtual)}/export-pvsyst/status/${taskId}`);
                            if (!statusRes.ok) return;
                            const statusData = await statusRes.json();
                            
                            setExportProgress(statusData.progress);
                            
                            if (statusData.status === 'done') {
                              clearInterval(interval);
                              // Faz o download
                              window.location.href = `${baseUrl}/flow/${encodeURIComponent(usinaAtual)}/export-pvsyst/download/${taskId}`;
                              setIsExporting(false);
                            } else if (statusData.status === 'error') {
                              clearInterval(interval);
                              setToast({ type: 'error', message: statusData.error || 'Erro na exportação.' });
                              setIsExporting(false);
                            }
                          } catch (e) {
                            console.error("Polling error:", e);
                          }
                        }, 1000);
                        
                      } catch (e) {
                          setIsExporting(false);
                          setToast({ type: 'error', message: 'Falha ao iniciar exportação.' });
                      }
                    }} 
                    className="btn"
                    style={{ background: isExporting ? 'var(--bg-secondary)' : '#233772', color: isExporting ? 'var(--text-muted)' : '#fff', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', height: '100%', cursor: isExporting ? 'wait' : 'pointer' }}
                  >
                    <span style={{ fontSize: '24px' }}>⬇️</span>
                    <span>{isExporting ? 'Gerando...' : 'Baixar Arquivo de\nImportação'}</span>
                  </button>
                  
                  {isExporting && (
                    <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#4ade80', width: `${exportProgress}%`, transition: 'width 0.3s' }}></div>
                    </div>
                  )}
                </div>

                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="file" 
                    ref={pvsystFileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".csv" 
                    onChange={handlePvsystUpload} 
                  />
                  <button 
                    onClick={() => pvsystFileInputRef.current?.click()} 
                    className="btn"
                    style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', height: '100%' }}
                  >
                    <span style={{ fontSize: '24px' }}>⬆️</span>
                    <span>Fazer Upload<br/>do Resultado</span>
                  </button>
                  {pvsystUploadProgress > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '6px', background: 'var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#4ade80', width: `${pvsystUploadProgress}%`, transition: 'width 0.3s' }}></div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="file" 
                    ref={tmyFileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".csv" 
                    onChange={handleTmyUpload} 
                  />
                  <button 
                    onClick={() => tmyFileInputRef.current?.click()} 
                    className="btn"
                    style={{ width: '100%', background: '#f59e0b', color: '#fff', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', height: 'auto' }}
                  >
                    <span style={{ fontSize: '24px' }}>☀️</span>
                    <span>Fazer Upload da<br/>Simulação TMY</span>
                  </button>
                  {tmyUploadProgress > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '6px', background: 'rgba(0,0,0,0.1)', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#4ade80', width: `${tmyUploadProgress}%`, transition: 'width 0.3s' }}></div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </>
      )}

      {/* ── MODAL EPI ── */}
      {selectedNodeId === 'epi' && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} onClick={() => setSelectedNodeId(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', zIndex: 1001,
            width: '700px', maxWidth: '90vw', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ marginTop: 0, color: '#233772', borderBottom: '1px solid var(--border)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>EPI (Energy Performance Index)</span>
              <button onClick={() => setSelectedNodeId(null)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </h3>
            
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isLoadingPvsystColumns ? (
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Carregando colunas do PVSyst...</div>
              ) : pvsystColumns.length === 0 ? (
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  Nenhum arquivo do PVSyst encontrado. Por favor, faça o upload do resultado no bloco PVSyst primeiro.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Variável de Energia Esperada:</label>
                    <select 
                      value={epiParams.energiaVar} 
                      onChange={(e) => setEpiParams({ ...epiParams, energiaVar: e.target.value })}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- Selecione a variável --</option>
                      {pvsystColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Variável de Irradiância:</label>
                    <select 
                      value={epiParams.irradianciaVar} 
                      onChange={(e) => setEpiParams({ ...epiParams, irradianciaVar: e.target.value })}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- Selecione a variável --</option>
                      {pvsystColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Variável de Perdas Ôhmicas:</label>
                    <select 
                      value={epiParams.ohmVar} 
                      onChange={(e) => setEpiParams({ ...epiParams, ohmVar: e.target.value })}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- Selecione a variável --</option>
                      {pvsystColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Variável de Energia do Arranjo na Entrada do Inversor:</label>
                    <select 
                      value={epiParams.earrayVar} 
                      onChange={(e) => setEpiParams({ ...epiParams, earrayVar: e.target.value })}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- Selecione a variável --</option>
                      {pvsystColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Tolerância EPI (%):</label>
                      <input 
                        type="text"
                        value={epiParams.tolerancia !== undefined ? epiParams.tolerancia : 3}
                        onChange={(e) => setEpiParams({ ...epiParams, tolerancia: e.target.value })}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Tolerância PR Medida (%):</label>
                      <input 
                        type="text"
                        value={epiParams.toleranciaPr !== undefined ? epiParams.toleranciaPr : 5}
                        onChange={(e) => setEpiParams({ ...epiParams, toleranciaPr: e.target.value })}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Tolerância PR Corrigida (%):</label>
                      <input 
                        type="text"
                        value={epiParams.toleranciaWcpr !== undefined ? epiParams.toleranciaWcpr : 5}
                        onChange={(e) => setEpiParams({ ...epiParams, toleranciaWcpr: e.target.value })}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Fator de Conversão de Energia:</label>
                    <input 
                      type="text"
                      placeholder="Ex: 0,005"
                      value={epiParams.fator_conversao !== undefined ? epiParams.fator_conversao : "1"}
                      onChange={(e) => {
                        let val = e.target.value;
                        setEpiParams({ ...epiParams, fator_conversao: val });
                      }}
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>
                </>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button className="btn btn-ghost" onClick={() => setSelectedNodeId(null)}>Cancelar</button>
              <button 
                className="btn btn-primary" 
                disabled={pvsystColumns.length === 0}
                onClick={() => {
                  const newNodes = nodes.map(n => {
                    if (n.id === 'epi') {
                      return { ...n, data: { ...n.data, epiParams } };
                    }
                    return n;
                  });
                  setNodes(newNodes);
                  const parsedTol = parseFloat(String(epiParams.tolerancia).replace(',', '.'));
                  if (!isNaN(parsedTol)) setEpiTol(parsedTol / 100);
                  
                  const parsedPr = parseFloat(String(epiParams.toleranciaPr).replace(',', '.'));
                  if (!isNaN(parsedPr)) setPrTol(parsedPr / 100);
                  
                  const parsedWcpr = parseFloat(String(epiParams.toleranciaWcpr).replace(',', '.'));
                  if (!isNaN(parsedWcpr)) setWcprTol(parsedWcpr / 100);
                  
                  saveNodeConfig(newNodes);
                  setSelectedNodeId(null);
                  setToast({ message: 'Variáveis do EPI salvas!', type: 'success' });
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SEÇÃO DA TABELA DE INTEGRAIS DIÁRIAS ── */}
      {(mode === 'all' || mode === 'validacao') && (
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
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <button
                  onClick={() => setShowValidInfo(v => !v)}
                  title="Entenda como a validação é calculada"
                  style={{
                    background: showValidInfo ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${showValidInfo ? 'var(--amber)' : 'var(--border)'}`,
                    borderRadius: '50%',
                    width: '22px', height: '22px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: '700',
                    color: showValidInfo ? 'var(--amber)' : 'var(--text-secondary)',
                    lineHeight: 1,
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  i
                </button>
                {showValidInfo && (
                  <div style={{
                    position: 'absolute',
                    top: '30px',
                    left: '0',
                    zIndex: 9999,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                    padding: '18px 28px',
                    width: '1080px',
                    maxWidth: '95vw',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    lineHeight: '1.6',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--amber)' }}>ℹ️ Como a validação é calculada</span>
                      <button onClick={() => setShowValidInfo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}>✕</button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '50%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '5px 10px', color: 'var(--text-secondary)', fontWeight: '600' }}>Coluna</th>
                          <th style={{ textAlign: 'left', padding: '5px 10px', color: 'var(--text-secondary)', fontWeight: '600' }}>Série base</th>
                          <th style={{ textAlign: 'left', padding: '5px 10px', color: 'var(--text-secondary)', fontWeight: '600' }}>Critério de aprovação</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Irradiância &gt; 600 W/m²<br/><span style={{ color: 'var(--text-secondary)' }}>Dados Medidos</span></td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--amber)', fontSize: '11px' }}>gpoa_15min<br/><span style={{ color: 'var(--text-secondary)', fontFamily: 'sans-serif', fontSize: '10px' }}>média 15 min da gpoa (1-min)</span></td>
                          <td style={{ padding: '6px 10px' }}>Bloco consecutivo ≥ 3h com média 15 min &gt; 600 W/m²</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Irradiância &gt; 600 W/m²<br/><span style={{ color: 'var(--text-secondary)' }}>Dados Válidos</span></td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--amber)', fontSize: '11px' }}>gpoa_válida_15min<br/><span style={{ color: 'var(--text-secondary)', fontFamily: 'sans-serif', fontSize: '10px' }}>média 15 min da gpoa_válida (1-min)</span></td>
                          <td style={{ padding: '6px 10px' }}>Bloco consecutivo ≥ 3h com média 15 min &gt; 600 W/m² <span style={{ color: 'var(--amber)', fontWeight: 600 }}>← usada na decisão final</span></td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Irradiação &gt; 3 kWh/m²<br/><span style={{ color: 'var(--text-secondary)' }}>Dados Medidos</span></td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--amber)', fontSize: '11px' }}>gpoa (1-min)<br/><span style={{ color: 'var(--text-secondary)', fontFamily: 'sans-serif', fontSize: '10px' }}>soma integral do dia ÷ 60.000</span></td>
                          <td style={{ padding: '6px 10px' }}>Σ gpoa [W/m²·min] ÷ 60.000 ≥ 3 kWh/m²</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>Irradiação &gt; 3 kWh/m²<br/><span style={{ color: 'var(--text-secondary)' }}>Dados Válidos</span></td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--amber)', fontSize: '11px' }}>gpoa_válida (1-min)<br/><span style={{ color: 'var(--text-secondary)', fontFamily: 'sans-serif', fontSize: '10px' }}>soma integral do dia ÷ 60.000</span></td>
                          <td style={{ padding: '6px 10px' }}>Σ gpoa_válida ÷ 60.000 ≥ 3 kWh/m² <span style={{ color: 'var(--amber)', fontWeight: 600 }}>← usada na decisão final</span></td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>Validação (Dia Válido)</td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }} colSpan={2}>Ambas as colunas de <strong>Dados Válidos</strong> aprovadas simultaneamente</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ marginTop: '12px', padding: '8px 10px', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', borderLeft: '3px solid var(--amber)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--amber)' }}>Contagem de pontos:</strong> cada ponto = 1 minuto. Ex: 540 pts = 9 h. A coluna "consecutivos" mostra o maior bloco ininterrupto acima do limiar.
                    </div>
                  </div>
                )}
              </div>
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
              Entradas
            </label>

            <label style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              fontSize: '13px', cursor: 'pointer', userSelect: 'none', 
              color: 'var(--text-primary)', fontWeight: '600'
            }}>
              <input 
                type="checkbox" 
                checked={showMeasured} 
                onChange={(e) => setShowMeasured(e.target.checked)} 
                style={{ 
                  width: '16px', height: '16px', 
                  accentColor: 'var(--amber)', cursor: 'pointer'
                }} 
              />
              Dados Medidos
            </label>

            <label style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              fontSize: '13px', cursor: 'pointer', userSelect: 'none', 
              color: 'var(--text-primary)', fontWeight: '600'
            }}>
              <input 
                type="checkbox" 
                checked={showValid} 
                onChange={(e) => setShowValid(e.target.checked)} 
                style={{ 
                  width: '16px', height: '16px', 
                  accentColor: 'var(--amber)', cursor: 'pointer'
                }} 
              />
              Dados Válidos
            </label>

            <label style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              fontSize: '13px', cursor: 'pointer', userSelect: 'none', 
              color: 'var(--text-primary)', fontWeight: '600'
            }}>
              <input 
                type="checkbox" 
                checked={showResults} 
                onChange={(e) => setShowResults(e.target.checked)} 
                style={{ 
                  width: '16px', height: '16px', 
                  accentColor: 'var(--amber)', cursor: 'pointer'
                }} 
              />
              Resultados
            </label>

            <label style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              fontSize: '13px', cursor: 'pointer', userSelect: 'none', 
              color: 'var(--text-primary)', fontWeight: '600'
            }}>
              <input 
                type="checkbox" 
                checked={showPR} 
                onChange={(e) => setShowPR(e.target.checked)} 
                style={{ 
                  width: '16px', height: '16px', 
                  accentColor: 'var(--amber)', cursor: 'pointer'
                }} 
              />
              PR
            </label>

            <label style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              fontSize: '13px', cursor: 'pointer', userSelect: 'none', 
              color: 'var(--text-primary)', fontWeight: '600'
            }}>
              <input 
                type="checkbox" 
                checked={showValidation} 
                onChange={(e) => setShowValidation(e.target.checked)} 
                style={{ 
                  width: '16px', height: '16px', 
                  accentColor: 'var(--amber)', cursor: 'pointer'
                }} 
              />
              Validação
            </label>

            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)' }} />

            {/* Toggle para Dias Válidos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: showOnlyValidDays ? 'var(--text-secondary)' : 'var(--text-primary)' }}>Todos os Dias</span>
              <div 
                onClick={() => setShowOnlyValidDays(!showOnlyValidDays)}
                style={{ 
                  width: '36px', height: '20px', 
                  background: showOnlyValidDays ? 'var(--amber)' : 'rgba(255,255,255,0.1)', 
                  borderRadius: '10px', 
                  position: 'relative', 
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{
                  width: '16px', height: '16px',
                  background: 'white', borderRadius: '50%',
                  position: 'absolute', top: '2px',
                  left: showOnlyValidDays ? '18px' : '2px',
                  transition: 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '600', color: showOnlyValidDays ? 'var(--amber)' : 'var(--text-secondary)' }}>Dias Válidos</span>
            </div>

            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)' }} />

            {/* Toggle para Agrupamento (Diário / Mensal) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: aggregationMode === 'monthly' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>Diário</span>
              <div 
                onClick={() => setAggregationMode(aggregationMode === 'daily' ? 'monthly' : 'daily')}
                style={{ 
                  width: '36px', height: '20px', 
                  background: aggregationMode === 'monthly' ? 'var(--blue)' : 'rgba(255,255,255,0.1)', 
                  borderRadius: '10px', 
                  position: 'relative', 
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{
                  width: '16px', height: '16px',
                  background: 'white', borderRadius: '50%',
                  position: 'absolute', top: '2px',
                  left: aggregationMode === 'monthly' ? '18px' : '2px',
                  transition: 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '600', color: aggregationMode === 'monthly' ? 'var(--blue)' : 'var(--text-secondary)' }}>Mensal</span>
            </div>

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
                padding: '10px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, 
                display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px', whiteSpace: 'nowrap' 
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
                  <input type="checkbox" checked={visibleVars.sujidade_dia} onChange={() => setVisibleVars(prev => ({ ...prev, sujidade_dia: !prev.sujidade_dia }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Sujidade (Dia Completo)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.sujidade_hora} onChange={() => setVisibleVars(prev => ({ ...prev, sujidade_hora: !prev.sujidade_hora }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Sujidade (Hora Restrita)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.sujidade_media} onChange={() => setVisibleVars(prev => ({ ...prev, sujidade_media: !prev.sujidade_media }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Sujidade (Média Interna)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.tracker} onChange={() => setVisibleVars(prev => ({ ...prev, tracker: !prev.tracker }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Tracker Piranômetro</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visibleVars.wcpr} onChange={() => setVisibleVars(prev => ({ ...prev, wcpr: !prev.wcpr }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  WCPR
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visibleVars.wcpr_bifacial} onChange={() => setVisibleVars(prev => ({ ...prev, wcpr_bifacial: !prev.wcpr_bifacial }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  WCPR Bifacial
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.potencia_ppc} onChange={() => setVisibleVars(prev => ({ ...prev, potencia_ppc: !prev.potencia_ppc }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Potência PPC</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.energia_pmi} onChange={() => setVisibleVars(prev => ({ ...prev, energia_pmi: !prev.energia_pmi }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Energia PMI</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.pvsyst} onChange={() => setVisibleVars(prev => ({ ...prev, pvsyst: !prev.pvsyst }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Energia Esperada</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.referencia_ppc} onChange={() => setVisibleVars(prev => ({ ...prev, referencia_ppc: !prev.referencia_ppc }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Referência PPC</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.pr_medida} onChange={() => setVisibleVars(prev => ({ ...prev, pr_medida: !prev.pr_medida }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>PR Medida</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visibleVars.pr_medida_bifacial} onChange={() => setVisibleVars(prev => ({ ...prev, pr_medida_bifacial: !prev.pr_medida_bifacial }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>PR Medida (Bifacial)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.pr_prevista} onChange={() => setVisibleVars(prev => ({ ...prev, pr_prevista: !prev.pr_prevista }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>PR Prevista</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visibleVars.pr_prevista_bifacial} onChange={() => setVisibleVars(prev => ({ ...prev, pr_prevista_bifacial: !prev.pr_prevista_bifacial }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>PR Prevista (Bifacial)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.curtailment} onChange={() => setVisibleVars(prev => ({ ...prev, curtailment: !prev.curtailment }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Curtailment</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.epi} onChange={() => setVisibleVars(prev => ({ ...prev, epi: !prev.epi }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>EPI</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.pr_medida} onChange={() => setVisibleVars(prev => ({ ...prev, pr_medida: !prev.pr_medida }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>PR Medida</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.pr_esperada} onChange={() => setVisibleVars(prev => ({ ...prev, pr_esperada: !prev.pr_esperada }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>PR Esperada</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.pr_esperada_bifacial} onChange={() => setVisibleVars(prev => ({ ...prev, pr_esperada_bifacial: !prev.pr_esperada_bifacial }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>PR Esperada (Bifacial)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.pr_prevista} onChange={() => setVisibleVars(prev => ({ ...prev, pr_prevista: !prev.pr_prevista }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>PR Prevista</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.tarrwtd} onChange={() => setVisibleVars(prev => ({ ...prev, tarrwtd: !prev.tarrwtd }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>TArrWtd</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.perdida_tracker} onChange={() => setVisibleVars(prev => ({ ...prev, perdida_tracker: !prev.perdida_tracker }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Energia Perdida Tracker</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={visibleVars.recuperavel} onChange={() => setVisibleVars(prev => ({ ...prev, recuperavel: !prev.recuperavel }))} style={{ accentColor: 'var(--amber)', width: '14px', height: '14px' }} />
                  <span>Energia CA Recuperável</span>
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

            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)', margin: '0 8px' }} />
            
            <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
              <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 12px', fontSize: '13px', flexShrink: 0, fontWeight: 600, background: '#e2e8f0', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                  onClick={() => exportTableToPng(tableRef.current, 'Resultados.png')}
                  title="Exportar tabela atual como Imagem PNG"
              >
                🖼️ PNG
              </button>
              <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 12px', fontSize: '13px', flexShrink: 0, fontWeight: 600, background: '#ffffff', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                  onClick={() => setShowPdfMenu(!showPdfMenu)}
                  title="Exportar tabela atual para PDF"
              >
                📄 PDF
              </button>
              
              {showPdfMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Orientação</div>
                  <button 
                    onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'Resultados.pdf', { usinaName: usinaAtual || 'N/D', forceOrientation: 'p' }) }} 
                    style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                  >
                    📄 Retrato (Vertical)
                  </button>
                  <button 
                    onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'Resultados.pdf', { usinaName: usinaAtual || 'N/D', forceOrientation: 'l' }) }} 
                    style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                  >
                    📄 Paisagem (Horizontal)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoadingIntegrals ? (
          <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ marginBottom: '16px', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>
              Calculando integrais das séries... {integralsProgress}%
            </div>
            <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto', background: 'var(--border)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${integralsProgress}%`, 
                background: 'var(--primary)', 
                height: '100%', 
                transition: 'width 0.3s ease' 
              }} />
            </div>
            <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
              Processando arquivos diários, por favor aguarde.
            </div>
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
          <div ref={tableRef} style={{ width: '100%', maxHeight: '70vh', overflow: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                {/* LINHA 1 (Nível Superior) */}
                <tr>
                  <th 
                    rowSpan={2} 
                    style={{ 
                      padding: '8px 10px', 
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
                      verticalAlign: 'middle',
                      whiteSpace: 'nowrap',
                      minWidth: '95px'
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
                          key={`group-${group.type}-${group.node_id}-${gIdx}`}
                          colSpan={group.columns.length}
                          style={{
                            padding: '6px 8px',
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
                    } else if (group.type === 'validation') {
                      // Render each validation column directly with rowSpan=2 (no group header cell)
                      return group.columns.map((col) => {
                        const colTheme = getColumnTheme(col);
                        return (
                          <th
                            key={`val-direct-${col.key}`}
                            rowSpan={2}
                            style={{
                              padding: '8px 8px',
                              fontWeight: '700',
                              fontSize: '11px',
                              color: colTheme.color,
                              borderBottom: '2px solid var(--border)',
                              textAlign: 'center',
                              whiteSpace: 'normal',
                              minWidth: col.key === 'dia_valido' ? '80px' : '160px',
                              background: 'var(--bg-secondary)',
                              verticalAlign: 'middle',
                            }}
                          >
                            {col.label}
                          </th>
                        );
                      });

                    } else {
                      // Output ou Special (spans across both rows)
                      const isStyled = group.type === 'output' || group.type === 'special';
                      return (
                        <th 
                          key={`group-single-${firstCol.key}`}
                          rowSpan={2}
                          style={{ 
                            padding: '8px 8px', 
                            fontWeight: '700', 
                            fontSize: '12px', 
                            color: firstCol.label.includes('Bifacial') ? '#8B4513' : (isStyled ? theme.color : 'var(--text-primary)'), 
                            borderBottom: '2px solid var(--border)', 
                            textAlign: 'center',
                            whiteSpace: (firstCol.label.startsWith('Sujidade (') || firstCol.label.includes('PVSyst') || firstCol.label.includes('Tracker Piranômetro') || firstCol.isCapacity || firstCol.label.includes('Bifacial')) ? 'pre-wrap' : 'nowrap',
                            minWidth: (firstCol.label.startsWith('Sujidade (') || firstCol.label.includes('PVSyst') || firstCol.label.includes('Tracker Piranômetro') || firstCol.isCapacity || firstCol.label.includes('Bifacial')) ? '60px' : 'auto',
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
                        const subLabel = col.type === 'validation' ? col.label : (match ? match[1] : (idx + 1).toString());
                        
                        return (
                          <th 
                            key={`sub-${col.type}-${col.key}`}
                            style={{ 
                              padding: '4px 6px', 
                              fontWeight: '700', 
                              fontSize: col.type === 'validation' ? '10px' : '11px', 
                              color: 'var(--text-secondary)', 
                              borderBottom: '2px solid var(--border)', 
                              textAlign: 'center',
                              whiteSpace: col.type === 'validation' ? 'normal' : 'nowrap',
                              minWidth: col.type === 'validation' ? '150px' : 'auto',
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
                {displayRows.map((row, idx) => (
                  <tr 
                    key={row.date} 
                    style={{ 
                      background: idx % 2 === 0 ? 'var(--bg-card)' : 'rgba(0,0,0,0.01)',
                      transition: 'background 0.15s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-card)' : 'rgba(0,0,0,0.01)'}
                    onClick={() => openChartPopup(row.date)}
                  >
                    <td style={{ 
                      padding: '6px 10px', 
                      fontWeight: '600', 
                      color: 'var(--text-primary)', 
                      borderBottom: '1px solid var(--border)', 
                      textAlign: 'left',
                      position: 'sticky',
                      left: 0,
                      background: 'var(--bg-card)',
                      zIndex: 1,
                      boxShadow: '2px 0 5px rgba(0,0,0,0.05)',
                      whiteSpace: 'nowrap',
                      minWidth: '95px'
                    }}>
                      {row.date}
                    </td>
                    {visibleColumns.map(col => {
                      const theme = getColumnTheme(col);
                      const isOutput = !col.label.includes('Entrada');
                      let val = row[col.key];
                      let formattedVal = typeof val === 'number' 
                        ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                        : val;
                      if (col.key.toLowerCase().includes('sujidade') && typeof val === 'number') {
                        formattedVal += '%';
                      }
                      if ((col.key === 'cap_ratio' || col.key === 'astm_ratio' || col.key === 'cap_ratio_adaptive' || col.key === 'astm_ratio_adaptive') && typeof val === 'number') {
                        formattedVal = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
                      }
                      if ((col.key === 'epi' || col.key === 'epi_corrigido' || col.key === 'epi_pvlib' || col.key === 'pr_medida' || col.key === 'pr_medida_bifacial' || col.key === 'pr_esperada' || col.key === 'pr_esperada_bifacial' || col.key === 'pr_prevista' || col.key === 'pr_prevista_bifacial' || col.key === 'wcpr' || col.key === 'wcpr_bifacial') && typeof val === 'number') {
                        formattedVal = (val * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
                      }
                      if (col.key === 'fator_ajuste' && typeof val === 'number') {
                        formattedVal = val.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                      }
                      let cellBackground = isOutput ? theme.bgCell : 'transparent';
                      let cellColor = isOutput ? 'var(--text-primary)' : 'var(--text-secondary)';
                      
                      if (col.type === 'validation') {
                        let status = val;
                        if (typeof val === 'string' && val.includes('|')) {
                          const firstPipe = val.indexOf('|');
                          status = val.substring(0, firstPipe);
                          formattedVal = val.substring(firstPipe + 1);
                        }
                        
                        if (status === 'OK' || status === 'Dia Válido') {
                          cellBackground = '#84cc16'; // darker green
                          cellColor = '#ffffff';
                        } else if (status === 'OK_RESSALVA') {
                          cellBackground = '#bbf7d0'; // light green
                          cellColor = '#166534';
                        } else if (status === 'NÃO_OK' || status === 'Dia Inválido') {
                          cellBackground = '#ef4444'; // red
                          cellColor = '#ffffff';
                        } else {
                          cellBackground = 'var(--bg-secondary)';
                        }
                      }
                      
                      if ((col.key === 'epi' || col.key === 'epi_corrigido' || col.key === 'epi_pvlib') && typeof val === 'number') {
                        const epiColor = getEpiColor(val, epiTol);
                        cellBackground = epiColor.bg;
                        cellColor = epiColor.text;
                      } else if ((col.key === 'cap_ratio' || col.key === 'astm_ratio' || col.key === 'cap_ratio_adaptive' || col.key === 'astm_ratio_adaptive') && typeof val === 'number') {
                        const epiColor = getEpiColor(val / 100, epiTol);
                        cellBackground = epiColor.bg;
                        cellColor = epiColor.text;
                      }

                      const targetPrevista = (col.key === 'pr_medida_bifacial' || col.key === 'wcpr_bifacial') ? row.pr_prevista_bifacial : row.pr_prevista;
                      if ((col.key === 'pr_medida' || col.key === 'pr_medida_bifacial' || col.key === 'wcpr' || col.key === 'wcpr_bifacial') && typeof val === 'number' && typeof targetPrevista === 'number') {
                        const tol = (col.key === 'pr_medida' || col.key === 'pr_medida_bifacial') ? prTol : wcprTol;
                        const colors = getPrWcprColor(val, targetPrevista, tol);
                        cellBackground = colors.bg;
                        cellColor = colors.text;
                      }
                      
                      let displayContent = formattedVal;
                      if (col.type === 'validation') {
                        if (typeof formattedVal === 'string' && formattedVal.includes('|')) {
                          const subParts = formattedVal.split('|');
                          if (subParts.length === 2) {
                            const totais = subParts[0].trim();
                            const consec = subParts[1].trim();
                            displayContent = (
                              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', lineHeight: '1.4' }}>
                                <span>{consec}</span>
                                <span>{totais}</span>
                              </div>
                            );
                          } else {
                            displayContent = <span style={{ fontSize: '11px' }}>{formattedVal}</span>;
                          }
                        } else {
                          displayContent = <span style={{ fontSize: '11px' }}>{formattedVal}</span>;
                        }
                      }

                      return (
                        <td 
                          key={col.key} 
                          style={{ 
                            padding: '6px 8px', 
                            borderBottom: '1px solid var(--border)', 
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            color: cellColor,
                            fontWeight: isOutput || col.type === 'validation' ? '600' : 'normal',
                            background: cellBackground
                          }}
                        >
                          {displayContent}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {totalsRow && (
                <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10, boxShadow: '0 -2px 4px rgba(0,0,0,0.05)' }}>
                  <tr style={{ background: 'var(--bg-secondary)', fontWeight: 'bold', borderTop: '2px double var(--border)' }}>
                    <td style={{ 
                      padding: '8px 10px', 
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
                      let formattedVal = typeof val === 'number' 
                        ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                        : val;
                      if (col.key.toLowerCase().includes('sujidade') && typeof val === 'number') {
                        formattedVal += '%';
                      }
                      if ((col.key === 'cap_ratio' || col.key === 'astm_ratio' || col.key === 'cap_ratio_adaptive' || col.key === 'astm_ratio_adaptive') && typeof val === 'number') {
                        formattedVal = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
                      }
                      if ((col.key === 'epi' || col.key === 'epi_corrigido' || col.key === 'epi_pvlib' || col.key === 'pr_medida' || col.key === 'pr_medida_bifacial' || col.key === 'pr_esperada' || col.key === 'pr_esperada_bifacial' || col.key === 'pr_prevista' || col.key === 'pr_prevista_bifacial' || col.key === 'wcpr' || col.key === 'wcpr_bifacial') && typeof val === 'number') {
                        formattedVal = (val * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
                      }
                      if (col.key === 'fator_ajuste' && typeof val === 'number') {
                        formattedVal = val.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                      }
                      let cellBackground = isOutput ? theme.bgTotal : 'transparent';
                      let cellColor = isOutput ? theme.color : 'var(--text-primary)';
                      
                      if ((col.key === 'epi' || col.key === 'epi_corrigido' || col.key === 'epi_pvlib') && typeof val === 'number') {
                        const epiColor = getEpiColor(val, epiTol);
                        cellBackground = epiColor.bg;
                        cellColor = epiColor.text;
                      } else if ((col.key === 'cap_ratio' || col.key === 'astm_ratio' || col.key === 'cap_ratio_adaptive' || col.key === 'astm_ratio_adaptive') && typeof val === 'number') {
                        const epiColor = getEpiColor(val / 100, epiTol);
                        cellBackground = epiColor.bg;
                        cellColor = epiColor.text;
                      }
                      
                      return (
                        <td 
                          key={col.key} 
                          style={{ 
                            padding: '8px 8px', 
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            color: cellColor,
                            fontWeight: '700',
                            background: cellBackground,
                            borderTop: '2px double var(--border)'
                          }}
                        >
                          {formattedVal}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
                )}
            </table>
          </div>
        )}
        
        {/* GRÁFICOS PRINCIPAIS FIXOS */}
        {integralsData?.rows?.length > 0 && (
          <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div ref={graficosPrincipaisRef} style={{ background: 'var(--bg-primary)', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 10px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                📈 Gráficos Principais
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', width: '280px', marginLeft: 'auto', marginRight: '24px' }}>
                <div style={{ display: 'flex', height: '10px', width: '100%', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ flex: '1', background: '#fee2e2', borderRight: '1px solid rgba(0,0,0,0.1)' }}></div>
                  <div style={{ flex: '2', background: 'linear-gradient(to right, #fef9c3, #bbf7d0)', borderRight: '1px solid rgba(0,0,0,0.1)' }}></div>
                  <div style={{ flex: '2', background: 'linear-gradient(to right, #bbf7d0, #fef9c3)', borderRight: '1px solid rgba(0,0,0,0.1)' }}></div>
                  <div style={{ flex: '1', background: '#dbeafe' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '4px', fontSize: '10px', color: 'var(--text-secondary)', position: 'relative', height: '12px' }}>
                  <span style={{ position: 'absolute', left: '16.66%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>Tol. Mín</span>
                  <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontWeight: 'bold' }}>Meta</span>
                  <span style={{ position: 'absolute', left: '83.33%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>Tol. Máx</span>
                </div>
              </div>

              <div data-html2canvas-ignore="true" style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => exportTableToPng(graficosPrincipaisRef.current, 'graficos_principais.png', { skipAncestorExpansion: true })}
                  style={{ 
                    background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', 
                    borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '600',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  title="Exportar os 3 gráficos principais para Imagem (PNG)"
                >
                  🖼️ PNG
                </button>
                <button 
                  onClick={() => exportTableToPdf(graficosPrincipaisRef.current, 'graficos_principais.pdf', { usinaName: usinaAtual || 'N/D', forceOrientation: 'p', skipAncestorExpansion: true })}
                  style={{ 
                    background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', 
                    borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '600',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  title="Exportar os 3 gráficos principais para PDF"
                >
                  📄 PDF
                </button>
              </div>
            </div>
            
            <div>
              {renderFixedChartUI("EPI - Energy Performance Index - PVSyst", fixedEpiNormalChart, "#3b82f6")}
              {renderFixedChartUI("EPI - Energy Performance Index - PVLib", fixedEpiChart, "#3b82f6")}
              {renderFixedChartUI("Daily Capacity Ratio (%) — Fixed RC", fixedCapRatioChart, "#3b82f6")}
              {renderFixedChartUI("Daily Capacity Ratio (%) — Adaptive RC", adaptiveCapRatioChart, "#1d4ed8")}
              {renderFixedChartUI(`ASTM Capacity Ratio (%) — Fixed RC - ${capacityTestDailyResults && Object.keys(capacityTestDailyResults).length > 0 && capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]]?.astmWindow ? capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]].astmWindow : 5} dias`, fixedAstmRatioChart, "#3b82f6")}
              {renderFixedChartUI(`ASTM Capacity Ratio (%) — Adaptive RC - ${capacityTestDailyResults && Object.keys(capacityTestDailyResults).length > 0 && capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]]?.astmWindow ? capacityTestDailyResults[Object.keys(capacityTestDailyResults)[0]].astmWindow : 5} dias`, adaptiveAstmRatioChart, "#1d4ed8")}
              {renderFixedChartUI("WCPR - Weather Corrected Performance Ratio - PR Corrigida por Temperatura", fixedWcprChart, "#3b82f6")}
              {renderFixedChartUI("WCPR Bifacial - Weather Corrected Performance Ratio - PR Corrigida por Temperatura Bifacial", fixedWcprBifacialChart, "#0ea5e9")}
              {renderFixedChartUI("Standard Performance Ratio - PR Simples", fixedPrChart, "#3b82f6")}
              {renderFixedChartUI("Standard Performance Ratio Bifacial - PR Simples Bifacial", fixedPrBifacialChart, "#0ea5e9")}
            </div>
          </div>
          </div>
        )}

        {/* GRÁFICO COMBINADO DE SÉRIES */}
        {integralsData?.rows?.length > 0 && (
          <div style={{ marginTop: '32px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                📊 Gráfico Customizável
              </h3>
              <button 
                onClick={addChartSeries}
                style={{ 
                  background: 'var(--blue)', color: 'white', border: 'none', 
                  borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '600',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                }}
              >
                <span>+</span> Adicionar Série
              </button>
            </div>
            
            {/* Lista de Séries Configuradas */}
            {chartSeries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {chartSeries.map(series => (
                  <div key={series.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <input 
                      type="color" 
                      value={series.color} 
                      onChange={(e) => updateChartSeries(series.id, 'color', e.target.value)}
                      style={{ width: '28px', height: '28px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                      title="Alterar cor da série"
                    />
                    
                    <select 
                      value={series.columnKey} 
                      onChange={(e) => updateChartSeries(series.id, 'columnKey', e.target.value)}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', outline: 'none', minWidth: '200px' }}
                    >
                      {integralsData.columns
                        .filter(col => col.key !== 'date' && col.key !== 'val_validacao')
                        .map(col => (
                        <option key={col.key} value={col.key}>{col.label}</option>
                      ))}
                    </select>

                    <select 
                      value={series.type} 
                      onChange={(e) => updateChartSeries(series.id, 'type', e.target.value)}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    >
                      <option value="bar">Barra</option>
                      <option value="line">Linha</option>
                    </select>

                    <select 
                      value={series.axis} 
                      onChange={(e) => updateChartSeries(series.id, 'axis', e.target.value)}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    >
                      <option value="left">Eixo Esquerdo</option>
                      <option value="right">Eixo Direito (Secundário)</option>
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={series.inheritColor || false} 
                          onChange={(e) => updateChartSeries(series.id, 'inheritColor', e.target.checked)} 
                          style={{ accentColor: 'var(--blue)' }}
                        />
                        Herdar Cores
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={series.showTolerance || false} 
                          onChange={(e) => updateChartSeries(series.id, 'showTolerance', e.target.checked)} 
                          style={{ accentColor: 'var(--amber)' }}
                        />
                        Limites de Tolerância
                      </label>
                    </div>

                    <button 
                      onClick={() => removeChartSeries(series.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '6px', borderRadius: '6px', marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remover série"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Plotly Chart Area */}
            {chartSeries.length > 0 ? (
              <div style={{ width: '100%', height: '500px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', padding: '10px' }}>
                <Plot
                  data={chartData}
                  layout={{
                    autosize: true,
                    margin: { l: 60, r: 60, t: 30, b: 60 },
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                    font: { color: 'var(--text-secondary)', size: 11 },
                    xaxis: { 
                      type: 'category', // Ensures correct chronological ordering based on the array
                      gridcolor: 'rgba(128,128,128,0.1)',
                      zerolinecolor: 'rgba(128,128,128,0.2)',
                      range: chartData && chartData[0] ? [-0.5, chartData[0].x.length - 0.5] : undefined
                    },
                    yaxis: { 
                      title: 'Eixo Esquerdo',
                      gridcolor: 'rgba(128,128,128,0.1)',
                      zerolinecolor: 'rgba(128,128,128,0.2)'
                    },
                    yaxis2: {
                      title: 'Eixo Direito',
                      overlaying: 'y',
                      side: 'right',
                      gridcolor: 'rgba(128,128,128,0.05)',
                      zerolinecolor: 'rgba(128,128,128,0.2)'
                    },
                    shapes: chartShapes,
                    barmode: 'group',
                    legend: { orientation: 'h', y: -0.2 }
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '100%' }}
                  config={{ responsive: true, displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ['select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d'] }}
                />
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                Nenhuma série adicionada. Clique em "Adicionar Série" para gerar o gráfico combinado.
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Chart Popup Modal */}
      {chartModalDate && (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(0,0,0,0.5)', zIndex: 9999, 
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: '#fff', borderRadius: 8, padding: '12px 16px', width: '95%', maxWidth: 1640,
                maxHeight: '90vh', overflowY: 'auto',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>
                        Análise Diária
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                            <span style={{ fontWeight: 600 }}>Eixo X:</span>
                            <input
                                type="time"
                                value={chartXRange[0]}
                                onChange={e => updateChartXRange([e.target.value, chartXRange[1]])}
                                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, width: 90, background: '#f8fafc', color: '#334155' }}
                            />
                            <span>—</span>
                            <input
                                type="time"
                                value={chartXRange[1]}
                                onChange={e => updateChartXRange([chartXRange[0], e.target.value])}
                                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, width: 90, background: '#f8fafc', color: '#334155' }}
                            />
                            <button
                                onClick={() => updateChartXRange(['00:00', '23:59'])}
                                title="Resetar para dia inteiro"
                                style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer', fontSize: 12, color: '#475569', lineHeight: 1 }}
                            >↺</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ position: 'relative' }} data-html2canvas-ignore="true">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowChartExportMenu(!showChartExportMenu)}
                                    title="Exportar gráfico"
                                    style={{ padding: '6px 12px', fontSize: 13, flexShrink: 0, fontWeight: 600, background: '#ffffff', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                                >
                                    📥 Exportar
                                </button>
                                {showChartExportMenu && (
                                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                                        <button 
                                            onClick={() => { setShowChartExportMenu(false); exportTableToPng(popupChartRef.current, `graficos_diarios_${chartModalDate}.png`, { skipAncestorExpansion: true }) }} 
                                            style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                        >
                                            🖼️ Imagem (PNG)
                                        </button>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4, marginBottom: 2, textTransform: 'uppercase' }}>PDF</div>
                                        <button 
                                            onClick={() => { setShowChartExportMenu(false); exportTableToPdf(popupChartRef.current, `graficos_diarios_${chartModalDate}.pdf`, { usinaName: usinaAtual || 'N/D', forceOrientation: 'p', skipAncestorExpansion: true }) }} 
                                            style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                        >
                                            📄 Retrato (Vertical)
                                        </button>
                                        <button 
                                            onClick={() => { setShowChartExportMenu(false); exportTableToPdf(popupChartRef.current, `graficos_diarios_${chartModalDate}.pdf`, { usinaName: usinaAtual || 'N/D', forceOrientation: 'l', skipAncestorExpansion: true }) }} 
                                            style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                                        >
                                            🗎 Paisagem (Horizontal)
                                        </button>
                                    </div>
                                )}
                            </div>
                            {chartModalDate && (() => {
                                const currentIndex = displayRows?.findIndex(r => r.date === chartModalDate) ?? -1;
                                const prevDate = currentIndex > 0 ? displayRows[currentIndex - 1].date : null;
                                const nextDate = currentIndex !== -1 && currentIndex < displayRows.length - 1 ? displayRows[currentIndex + 1].date : null;
                                
                                const rowData = displayRows?.find(r => r.date === chartModalDate);
                                const validationCol = integralsData?.columns?.find(c => c.type === 'validation');
                                let validationStatus = 'N/D';
                                let badgeBg = '#94a3b8';
                                let badgeColor = '#ffffff';
                                if (validationCol && rowData) {
                                    let status = rowData[validationCol.key];
                                    if (typeof status === 'string' && status.includes('|')) {
                                        status = status.substring(0, status.indexOf('|'));
                                    }
                                    if (status === 'OK' || status === 'Dia Válido') {
                                        validationStatus = 'Válido';
                                        badgeBg = '#84cc16';
                                    } else if (status === 'OK_RESSALVA') {
                                        validationStatus = 'Válido (Ressalva)';
                                        badgeBg = '#bbf7d0';
                                        badgeColor = '#166534';
                                    } else if (status === 'NÃO_OK' || status === 'Dia Inválido') {
                                        validationStatus = 'Inválido';
                                        badgeBg = '#ef4444';
                                    }
                                }
                                return (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} data-html2canvas-ignore="true">
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <button 
                                                disabled={!prevDate}
                                                onClick={() => openChartPopup(prevDate)}
                                                style={{ border: 'none', background: 'transparent', cursor: prevDate ? 'pointer' : 'not-allowed', opacity: prevDate ? 1 : 0.3, padding: '4px', display: 'flex', alignItems: 'center' }}
                                                title="Dia Anterior"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                                            </button>
                                            
                                            <div style={{ padding: '4px 12px', borderRadius: 16, background: '#e2e8f0', color: '#334155', fontWeight: 'bold', fontSize: 14 }}>
                                                {chartModalDate.split('-').reverse().join('/')}
                                            </div>

                                            <button 
                                                disabled={!nextDate}
                                                onClick={() => openChartPopup(nextDate)}
                                                style={{ border: 'none', background: 'transparent', cursor: nextDate ? 'pointer' : 'not-allowed', opacity: nextDate ? 1 : 0.3, padding: '4px', display: 'flex', alignItems: 'center' }}
                                                title="Próximo Dia"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                            </button>
                                        </div>
                                        {validationStatus !== 'N/D' && (
                                            <div style={{ padding: '4px 12px', borderRadius: 16, background: badgeBg, color: badgeColor, fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {validationStatus}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            <button data-html2canvas-ignore="true" onClick={() => setChartModalDate(null)} style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0, marginTop: '-4px' }}>×</button>
                        </div>
                    </div>
                </div>
                <div ref={popupChartRef} style={{ background: '#fff', padding: '10px 0', position: 'relative' }}>
                    {chartLoading && !popupChartData && <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '16px' }}>Carregando dados do dia...</div>}
                    {chartError && <div style={{ color: 'red', margin: '20px 0' }}>Erro: {chartError}</div>}
                    {popupChartData && (() => {
                        const rowData = displayRows.find(r => r.date === chartModalDate) || {};
                        return (
                            <div style={{ display: 'flex', gap: '20px', opacity: chartLoading ? 0.4 : 1, pointerEvents: chartLoading ? 'none' : 'auto', transition: 'opacity 0.2s ease-in-out' }}>
                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 16px' }}>
                            {/* Gráfico 1: Ambientais (linha 1, col 1) */}
                            <div style={{ width: '100%', height: 340, display: 'flex', flexDirection: 'column' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#334155', flexShrink: 0 }}>Variáveis Ambientais</h4>
                                <Plot
                                    data={[
                                        { ...getFillData(popupChartData.timestamps, popupChartData.gpoa), type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tozeroy', fillcolor: 'rgba(250, 204, 21, 0.15)', showlegend: false, hoverinfo: 'skip' },
                                        { x: popupChartData.timestamps, y: popupChartData.gpoa, type: 'scatter', mode: 'lines', name: 'GPOA (W/m²)', line: { color: '#facc15', width: 1 } },
                                        { ...getFillData(popupChartData.timestamps, popupChartData.grear), type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tozeroy', fillcolor: 'rgba(254, 215, 170, 0.3)', showlegend: false, hoverinfo: 'skip' },
                                        { x: popupChartData.timestamps, y: popupChartData.grear, type: 'scatter', mode: 'lines', name: 'Grear (W/m²)', line: { color: '#fed7aa', width: 1 } },
                                        { x: popupChartData.timestamps, y: popupChartData.geff, type: 'scatter', mode: 'lines', name: 'Geff (W/m²)', line: { color: '#f97316', width: 1 } },
                                        { x: popupChartData.timestamps, y: popupChartData.tamb, type: 'scatter', mode: 'lines', name: 'Tamb (°C)', yaxis: 'y2', line: { color: '#cbd5e1', width: 1 } },
                                        { x: popupChartData.timestamps, y: popupChartData.tmod, type: 'scatter', mode: 'lines', name: 'Tmod (°C)', yaxis: 'y2', line: { color: '#818cf8', width: 1 } },
                                        { x: popupChartData.timestamps, y: popupChartData.tcel, type: 'scatter', mode: 'lines', name: 'Tcel (°C)', yaxis: 'y2', line: { color: '#312e81', width: 1 } },
                                        {
                                            ...getFillData(popupChartData.timestamps, popupChartData.dados_validos),
                                            type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                            fill: 'tozeroy', fillcolor: 'rgba(100, 116, 139, 0.3)',
                                            name: 'Dados Válidos', xaxis: 'x2', yaxis: 'y3'
                                        }
                                    ]}
                                    layout={{
                                        font: { size: 10 },
                                        legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: { size: 10 } },
                                        margin: { t: 40, r: 50, b: 45, l: 50 },
                                        xaxis: { 
                                            type: 'date',
                                            range: [`${chartModalDate} ${chartXRange[0]}:00`, `${chartModalDate} ${chartXRange[1]}:59`],
                                            tickformat: '%H:%M',
                                            dtick: 3600000
                                        },
                                        xaxis2: { anchor: 'y3', matches: 'x', showgrid: false, showticklabels: false, zeroline: false },
                                        yaxis: { domain: [0, 0.90], title: 'W/m²' },
                                        yaxis2: { domain: [0, 0.90], title: '°C', overlaying: 'y', side: 'right' },
                                        yaxis3: { domain: [0.90, 0.95], showticklabels: false, range: [0, 1.2], fixedrange: true, zeroline: false, showgrid: false, showline: false },
                                        hovermode: 'x unified'
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                    useResizeHandler
                                    config={{ displaylogo: false, modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d', 'autoScale2d'] }}
                                    onRelayout={handleChartRelayout}
                                    revision={chartRevision}
                                />
                            </div>
                            
                            {/* Gráfico 2: Curtailment (linha 1, col 2) */}
                            <div style={{ width: '100%', height: 340, display: 'flex', flexDirection: 'column' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#334155', flexShrink: 0 }}>Curtailment</h4>
                                <Plot
                                    data={[
                                        {
                                            ...getFillData(popupChartData.timestamps, popupChartData.referencia_ppc_15min),
                                            type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hv' }, fill: 'tozeroy', fillcolor: 'rgba(106, 27, 154, 0.1)',
                                            name: 'Referência PPC_15min'
                                        },
                                        {
                                            ...getFillData(popupChartData.timestamps, popupChartData.potencia_ppc_15min),
                                            type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hv' }, fill: 'tozeroy', fillcolor: 'rgba(124, 179, 66, 0.2)',
                                            name: 'Potência PPC_15min'
                                        },
                                        { x: popupChartData.timestamps, y: popupChartData.potencia_ppc, type: 'scatter', mode: 'lines', name: 'Potência PPC', line: { color: '#00838F', width: 1.5 } },
                                        { x: popupChartData.timestamps, y: popupChartData.referencia_ppc, type: 'scatter', mode: 'lines', name: 'Referência PPC', line: { color: '#E53935', width: 1.5 } },
                                        {
                                            ...getFillData(popupChartData.timestamps, popupChartData.flag_curtailment),
                                            type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                            fill: 'tozeroy', fillcolor: 'rgba(5, 150, 105, 0.3)',
                                            name: 'curtailment', xaxis: 'x2', yaxis: 'y2'
                                        }
                                    ]}
                                    layout={{
                                        font: { size: 10 },
                                        legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: { size: 10 } },
                                        margin: { t: 40, r: 50, b: 45, l: 50 },
                                        xaxis: { 
                                            type: 'date',
                                            range: [`${chartModalDate} ${chartXRange[0]}:00`, `${chartModalDate} ${chartXRange[1]}:59`],
                                            tickformat: '%H:%M',
                                            dtick: 3600000
                                        },
                                        xaxis2: { anchor: 'y2', matches: 'x', showgrid: false, showticklabels: false, zeroline: false },
                                        yaxis: { domain: [0, 0.90], title: 'kW' },
                                        yaxis2: { domain: [0.90, 0.95], showticklabels: false, range: [0, 1.2], fixedrange: true, zeroline: false, showgrid: false, showline: false },
                                        hovermode: 'x unified'
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                    useResizeHandler
                                    config={{ displaylogo: false, modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d', 'autoScale2d'] }}
                                    onRelayout={handleChartRelayout}
                                    revision={chartRevision}
                                />
                            </div>

                            {/* Gráfico 3: Energia (linha 2, col 1) */}
                            <div style={{ width: '100%', height: 340, display: 'flex', flexDirection: 'column' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#334155', flexShrink: 0 }}>PVSyst e Energia Gerada</h4>
                                <Plot
                                    data={[
                                        {
                                            ...getFillData(popupChartData.timestamps, popupChartData.energia_pmi_valida),
                                            type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0 }, fill: 'tozeroy', fillcolor: 'rgba(2, 119, 189, 0.09)',
                                            name: 'Energia PMI_válida'
                                        },
                                        { x: popupChartData.timestamps, y: popupChartData.energia_pmi, type: 'scatter', mode: 'lines', name: 'Energia PMI', line: { color: '#0277BD', width: 1 } },
                                        { x: popupChartData.timestamps, y: popupChartData.e_grid_ajustada_corr, type: 'scatter', mode: 'lines', name: 'E_Grid_Ajustada_Corr_Unidade_válida', line: { color: '#D81B60', width: 1.5 } },
                                        {
                                            ...getFillData(popupChartData.timestamps, popupChartData.dados_validos),
                                            type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                            fill: 'tozeroy', fillcolor: 'rgba(100, 116, 139, 0.3)',
                                            name: 'Dados Válidos', xaxis: 'x2', yaxis: 'y2'
                                        }
                                    ]}
                                    layout={{
                                        font: { size: 10 },
                                        legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: { size: 10 } },
                                        margin: { t: 40, r: 50, b: 45, l: 50 },
                                        xaxis: { 
                                            type: 'date',
                                            range: [`${chartModalDate} ${chartXRange[0]}:00`, `${chartModalDate} ${chartXRange[1]}:59`],
                                            tickformat: '%H:%M',
                                            dtick: 3600000
                                        },
                                        xaxis2: { anchor: 'y2', matches: 'x', showgrid: false, showticklabels: false, zeroline: false },
                                        yaxis: { domain: [0, 0.90], title: 'kW' },
                                        yaxis2: { domain: [0.90, 0.95], showticklabels: false, range: [0, 1.2], fixedrange: true, zeroline: false, showgrid: false, showline: false },
                                        hovermode: 'x unified'
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                    useResizeHandler
                                    config={{ displaylogo: false, modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d', 'autoScale2d'] }}
                                    onRelayout={handleChartRelayout}
                                    revision={chartRevision}
                                />
                            </div>

                            {/* Gráfico 4: Potência CC Strings Perdida (linha 2, col 2) */}
                            <div style={{ width: '100%', height: 340, display: 'flex', flexDirection: 'column' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#334155', flexShrink: 0 }}>Potência CC Strings Perdida</h4>
                                <Plot
                                    data={[
                                        { ...getFillData(popupChartData.timestamps, popupChartData.potencia_ca_recuperavel), type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tozeroy', fillcolor: 'rgba(123, 255, 25, 0.20)', showlegend: false, hoverinfo: 'skip' },
                                        { x: popupChartData.timestamps, y: popupChartData.potencia_ca_recuperavel, type: 'scatter', mode: 'lines', name: 'Potência CA Recuperável', line: { color: '#7BFF19', width: 1 } },
                                        { ...getFillData(popupChartData.timestamps, popupChartData.energia_pmi), type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tozeroy', fillcolor: 'rgba(2, 119, 189, 0.09)', showlegend: false, hoverinfo: 'skip' },
                                        { x: popupChartData.timestamps, y: popupChartData.energia_pmi, type: 'scatter', mode: 'lines', name: 'Energia PMI', line: { color: '#0277BD', width: 1 } },
                                        { x: popupChartData.timestamps, y: popupChartData.potencia_ca_vaga, type: 'scatter', mode: 'lines', name: 'Potência CA Vaga', line: { color: '#8748AE', width: 1 } },
                                        { x: popupChartData.timestamps, y: popupChartData.e_grid_ajustada_mw, type: 'scatter', mode: 'lines', name: 'E_Grid_Ajustada_MW', line: { color: '#1565C0', width: 2.5 } },
                                        {
                                            ...getFillData(popupChartData.timestamps, popupChartData.dados_validos),
                                            type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                            fill: 'tozeroy', fillcolor: 'rgba(100, 116, 139, 0.3)',
                                            name: 'Dados Válidos', xaxis: 'x2', yaxis: 'y2'
                                        }
                                    ]}
                                    layout={{
                                        font: { size: 10 },
                                        legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: { size: 10 }, itemwidth: 30 },
                                        margin: { t: 40, r: 50, b: 45, l: 50 },
                                        xaxis: { 
                                            type: 'date',
                                            range: [`${chartModalDate} ${chartXRange[0]}:00`, `${chartModalDate} ${chartXRange[1]}:59`],
                                            tickformat: '%H:%M',
                                            dtick: 3600000
                                        },
                                        xaxis2: { anchor: 'y2', matches: 'x', showgrid: false, showticklabels: false, zeroline: false },
                                        yaxis: { domain: [0, 0.90], title: 'kW' },
                                        yaxis2: { domain: [0.90, 0.95], showticklabels: false, range: [0, 1.2], fixedrange: true, zeroline: false, showgrid: false, showline: false },
                                        hovermode: 'x unified'
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                    useResizeHandler
                                    config={{ displaylogo: false, modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d', 'autoScale2d'] }}
                                    onRelayout={handleChartRelayout}
                                    revision={chartRevision}
                                />
                            </div>
                        </div>
                        {rowData && (
                            <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                                <h4 style={{ margin: 0, fontSize: '15px', color: '#334155', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>Métricas do Dia</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Convencional</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>PR Esperada</span> <span style={{ fontWeight: 600 }}>{rowData.pr_esperada != null ? (rowData.pr_esperada * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>PR Medida</span> <span style={{ fontWeight: 600 }}>{rowData.pr_medida != null ? (rowData.pr_medida * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>WCPR</span> <span style={{ fontWeight: 600 }}>{rowData.wcpr != null ? (rowData.wcpr * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>PR Prevista</span> <span style={{ fontWeight: 600 }}>{rowData.pr_prevista != null ? (rowData.pr_prevista * 100).toFixed(2) + '%' : '-'}</span></div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#8B4513', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bifacial</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>PR Esperada</span> <span style={{ fontWeight: 600, color: '#8B4513' }}>{rowData.pr_esperada_bifacial != null ? (rowData.pr_esperada_bifacial * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>PR Medida</span> <span style={{ fontWeight: 600, color: '#8B4513' }}>{rowData.pr_medida_bifacial != null ? (rowData.pr_medida_bifacial * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>WCPR</span> <span style={{ fontWeight: 600, color: '#8B4513' }}>{rowData.wcpr_bifacial != null ? (rowData.wcpr_bifacial * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>PR Prevista</span> <span style={{ fontWeight: 600, color: '#8B4513' }}>{rowData.pr_prevista_bifacial != null ? (rowData.pr_prevista_bifacial * 100).toFixed(2) + '%' : '-'}</span></div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Capacity Test</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>Cap. Ratio</span> <span style={{ fontWeight: 600 }}>{rowData.cap_ratio != null ? rowData.cap_ratio.toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>ASTM Ratio</span> <span style={{ fontWeight: 600 }}>{rowData.astm_ratio != null ? rowData.astm_ratio.toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>Cap. Adapt.</span> <span style={{ fontWeight: 600 }}>{rowData.cap_ratio_adaptive != null ? rowData.cap_ratio_adaptive.toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>ASTM Adapt.</span> <span style={{ fontWeight: 600 }}>{rowData.astm_ratio_adaptive != null ? rowData.astm_ratio_adaptive.toFixed(2) + '%' : '-'}</span></div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.5px' }}>EPI</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>EPI</span> <span style={{ fontWeight: 600 }}>{rowData.epi != null ? (rowData.epi * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>EPI Corrigido</span> <span style={{ fontWeight: 600 }}>{rowData.epi_corrigido != null ? (rowData.epi_corrigido * 100).toFixed(2) + '%' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>EPI PVLib</span> <span style={{ fontWeight: 600 }}>{rowData.epi_pvlib != null ? (rowData.epi_pvlib * 100).toFixed(2) + '%' : '-'}</span></div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Temperatura</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>Tcel Válida</span> <span style={{ fontWeight: 600 }}>{rowData.tcel_válida != null ? rowData.tcel_válida.toFixed(2) + ' °C' : '-'}</span></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span>TArrWtd</span> <span style={{ fontWeight: 600 }}>{rowData.tarrwtd != null ? rowData.tarrwtd.toFixed(2) + ' °C' : '-'}</span></div>
                                </div>
                            </div>
                        )}
                        </div>
                        );
                    })()}
                </div>
            </div>
        </div>
      )}

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
