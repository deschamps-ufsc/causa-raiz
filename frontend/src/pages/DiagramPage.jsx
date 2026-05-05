import React, { useEffect, useState, useCallback } from 'react'
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { useUsina } from '../hooks/UsinaContext'
import { fetchMappingData } from '../services/api'

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: direction, nodesep: 15, edgesep: 5, ranksep: 50 })

  nodes.forEach((node) => {
    let w = 110; let h = 46;
    if (node.type === 'leaf') { w = 110; h = 32 }
    dagreGraph.setNode(node.id, { width: w, height: h })
  })

  edges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target) })

  dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.targetPosition = direction === 'TB' ? Position.Top : Position.Left
    node.sourcePosition = direction === 'TB' ? Position.Bottom : Position.Right

    let w = 110; let h = 46;
    if (node.type === 'leaf') { w = 110; h = 32 }
    
    node.position = {
      x: nodeWithPosition.x - w / 2,
      y: nodeWithPosition.y - h / 2,
    }
    return node
  })
  return { layoutedNodes: nodes, layoutedEdges: edges }
}

export default function DiagramTab() {
  const { usinaAtual } = useUsina()
  const [data, setData] = useState(null)
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  
  const [expandedNodes, setExpandedNodes] = useState(new Set(['ROOT']))
  const [tooltip, setTooltip] = useState(null)
  
  const [direction, setDirection] = useState('TB')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!usinaAtual) return
    setLoading(true)
    fetchMappingData(usinaAtual).then(res => {
      setData(res)
      setExpandedNodes(new Set(['ROOT'])) // zera state pro Root
    }).catch(err => {
      console.error(err)
      alert("Erro ao carregar mapa: " + err.message)
    }).finally(() => setLoading(false))
  }, [usinaAtual])

  useEffect(() => {
    if (!data) return
    
    const initialNodes = []
    const initialEdges = []
    
    const addNode = (id, label, seriesList, style, type='default') => {
      initialNodes.push({
        id, type,
        data: { label, linkedSeries: seriesList || [] },
        style: {
          width: 110,
          fontSize: type==='leaf' ? 9 : 11,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          textAlign: 'center',
          padding: 4,
          cursor: type==='leaf' ? 'default' : 'pointer',
          ...style
        }
      })
    }
    
    const addEdgeItem = (src, tgt) => {
      initialEdges.push({
        id: `${src}-${tgt}`,
        source: src,
        target: tgt,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1.5 }
      })
    }

    const skids = {}
    Object.keys(data).forEach(key => {
      const m = data[key]
      if (!m.skid) return
      
      const sk = m.skid
      const inv = m.inversor || 'GERAL'
      const sb = m.stringbox || 'GERAL'
      
      if (!skids[sk]) skids[sk] = { invs: {}, series: [], childrenCount: 0 }
      
      const metaVar = { raw: key, friendly: m.elemento || key }
      
      if (inv === 'GERAL') {
          skids[sk].series.push(metaVar)
      } else {
          if (!skids[sk].invs[inv]) {
             skids[sk].invs[inv] = { sbs: {}, series: [], childrenCount: 0 }
             skids[sk].childrenCount++
          }
          
          if (sb === 'GERAL') {
              skids[sk].invs[inv].series.push(metaVar)
          } else {
              if (!skids[sk].invs[inv].sbs[sb]) {
                 skids[sk].invs[inv].sbs[sb] = { series: [], childrenCount: 0 }
                 skids[sk].invs[inv].childrenCount++
              }
              skids[sk].invs[inv].sbs[sb].series.push(metaVar)
              skids[sk].invs[inv].sbs[sb].childrenCount++
          }
      }
    })

    addNode(
      'ROOT', 
      <div style={{lineHeight:'1.2', fontWeight: 700}}>{usinaAtual}</div>, 
      null, 
      { background: '#0f172a', color: 'white', fontWeight: 'bold', fontSize: 13, border: 'none', borderRadius: 8 }
    )

    if (expandedNodes.has('ROOT')) {
      const sortedSkids = Object.keys(skids).sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true}))
      
      sortedSkids.forEach(sk => {
        const skId = `SK_${sk}`
        const nodeData = skids[sk]
        const isExp = expandedNodes.has(skId)

        addNode(
            skId, 
            <div style={{lineHeight:'1.2', fontWeight: 700}}>{sk}</div>, 
            nodeData.series, 
            { background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', fontWeight: 600, borderRadius: 6 }
        )
        addEdgeItem('ROOT', skId)
        
        if (isExp) {
           const sortedInvs = Object.keys(nodeData.invs).sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true}))
           
           sortedInvs.forEach(inv => {
             const invId = `INV_${sk}_${inv}`
             const invData = nodeData.invs[inv]
             const invIsExp = expandedNodes.has(invId)

             addNode(
                 invId, 
                 <div style={{lineHeight:'1.2', fontWeight: 700}}>{inv}</div>, 
                 invData.series, 
                 { background: '#334155', border: '1px solid #475569', color: '#f8fafc', fontWeight: 500, borderRadius: 4 }
             )
             addEdgeItem(skId, invId)
             
             if (invIsExp) {
                 const sortedSbs = Object.keys(invData.sbs).sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true}))
                 
                 sortedSbs.forEach(sb => {
                   const sbId = `SB_${sk}_${inv}_${sb}`
                   const sbData = invData.sbs[sb]
                   
                   const sbIsExp = expandedNodes.has(sbId)
                   
                   const label = (
                      <div style={{ lineHeight: '1.2', fontWeight: 700 }}>
                         {sb}
                      </div>
                   )
                   
                   addNode(sbId, label, sbData.series, { background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: 4 })
                   addEdgeItem(invId, sbId)
                   
                   if (sbIsExp) {
                      const elementGroups = {}
                      sbData.series.forEach(sObj => {
                          const el = sObj.friendly;
                          if (!elementGroups[el]) elementGroups[el] = [];
                          elementGroups[el].push(sObj);
                      })
                      
                      const elementNamesSorted = Object.keys(elementGroups).sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true}))
                      
                      elementNamesSorted.forEach((elName, idx) => {
                         const leafId = `LF_${sk}_${inv}_${sb}_${idx}`
                         const groupedSeries = elementGroups[elName].sort((a,b) => String(a.raw).localeCompare(String(b.raw), undefined, {numeric: true}))
                         
                         addNode(leafId, elName, groupedSeries, { background: '#ffffff', border: '1px solid #94a3b8', color: '#0f172a', borderRadius: 4 }, 'leaf')
                         addEdgeItem(sbId, leafId)
                      })
                   }
                 })
             }
           })
        }
      })
    }

    const { layoutedNodes, layoutedEdges } = getLayoutedElements(initialNodes, initialEdges, direction)
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)

  }, [data, usinaAtual, direction, expandedNodes, setNodes, setEdges])

  const onNodeClick = useCallback((event, node) => {
      if (node.type === 'leaf') return;
      
      setExpandedNodes(prev => {
          const next = new Set(prev)
          if (next.has(node.id)) next.delete(node.id)
          else next.add(node.id)
          return next
      })
  }, [])

  const onNodeMouseEnter = useCallback((event, node) => {
      if (!node.data.linkedSeries || node.data.linkedSeries.length === 0) return
      
      setTooltip({
          x: event.clientX,
          y: event.clientY,
          series: node.data.linkedSeries
      })
  }, [])
  
  const onNodeMouseMove = useCallback((event) => {
      setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null)
  }, [])
  
  const onNodeMouseLeave = useCallback(() => setTooltip(null), [])
  const onPaneClick = useCallback(() => setTooltip(null), [])

  if (!usinaAtual) {
    return <div style={{ padding: 20 }}>Selecione uma usina no menu superior para visualizar o seu Diagrama.</div>
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600 }}>
      {tooltip && tooltip.series && (
          <div style={{
              position: 'fixed', left: tooltip.x + 20, top: tooltip.y + 20, zIndex: 9999,
              background: '#0f172a', color: 'white', padding: '12px 18px', borderRadius: 10,
              boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)', pointerEvents: 'none', minWidth: 350, maxWidth: 900
          }}>
             <div style={{ fontWeight: 'bold', fontSize: 13, borderBottom: '1px solid #334155', paddingBottom: 8, marginBottom: 10 }}>
                Sensores Acoplados Diretamente ({tooltip.series.length})
             </div>
             <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                 <table style={{ flex: 1, fontSize: 11, borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                       <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                          <th style={{ padding: '4px 8px', fontWeight: 600 }}>Elemento</th>
                          <th style={{ padding: '4px 8px', fontWeight: 600 }}>Variável (Excel)</th>
                       </tr>
                    </thead>
                    <tbody>
                       {tooltip.series.slice(0, Math.ceil(tooltip.series.length / (tooltip.series.length > 15 ? 2 : 1))).map((s, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                             <td style={{ padding: '4px 8px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>{s.friendly}</td>
                             <td style={{ padding: '4px 8px', color: '#38bdf8', whiteSpace: 'nowrap' }}>{s.raw}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
                 
                 {tooltip.series.length > 15 && (
                     <table style={{ flex: 1, fontSize: 11, borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                           <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                              <th style={{ padding: '4px 8px', fontWeight: 600 }}>Elemento</th>
                              <th style={{ padding: '4px 8px', fontWeight: 600 }}>Variável (Excel)</th>
                           </tr>
                        </thead>
                        <tbody>
                           {tooltip.series.slice(Math.ceil(tooltip.series.length / 2)).map((s, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                                 <td style={{ padding: '4px 8px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>{s.friendly}</td>
                                 <td style={{ padding: '4px 8px', color: '#38bdf8', whiteSpace: 'nowrap' }}>{s.raw}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                 )}
             </div>
          </div>
      )}

      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', gap: 24, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Fluxograma Operacional</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Orientação:</span>
          <select className="input" value={direction} onChange={e => setDirection(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, width: 140 }}>
            <option value="TB">Hierarquia Vertical</option>
            <option value="LR">Fluxo Horizontal</option>
          </select>
        </div>
      </div>
      
      <div style={{ flex: 1, position: 'relative', background: '#f8fafc', height: '100%', width: '100%', minHeight: 500 }}>
        {loading ? (
             <div style={{ padding: 40, textAlign: 'center', color: '#475569' }}>Construindo malha hierárquica...</div>
        ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseMove={onNodeMouseMove}
              onNodeMouseLeave={onNodeMouseLeave}
              onPaneClick={onPaneClick}
              nodesConnectable={false}
              elementsSelectable={false}
              fitView
              attributionPosition="bottom-right"
              minZoom={0.05}
            >
              <Background color="#cbd5e1" gap={20} size={1} />
              <Controls />
              <MiniMap nodeStrokeColor={(n) => {
                  if (n.type === 'leaf') return '#94a3b8'
                  if (n.id.startsWith('SB_')) return '#cbd5e1'
                  return '#0f172a'
              }} nodeColor={(n) => {
                  if (n.id === 'ROOT') return '#0f172a'
                  if (n.id.startsWith('SK_')) return '#1e293b'
                  if (n.id.startsWith('INV_')) return '#334155'
                  if (n.type === 'leaf') return '#ffffff'
                  return '#f1f5f9'
              }} />
            </ReactFlow>
        )}
      </div>
    </div>
  )
}
