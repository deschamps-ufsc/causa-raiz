import React, { useState, useEffect, useMemo, useRef } from 'react';
import PlotWrapper from 'react-plotly.js';
const Plot = PlotWrapper.default || PlotWrapper;
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf';
import { ErrorState, EmptyState } from './StateComponents';

export default function EventosExtremosView({ usina, dates, data, selectedSeries = [], loading }) {
  const tableRef = useRef(null);
  const [binSize, setBinSize] = useState(50);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const [processedData, setProcessedData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [selectedLocalDates, setSelectedLocalDates] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const allDates = useMemo(() => {
    if (!data || !data.timestamps) return [];
    const dateSet = new Set();
    for (let i = 0; i < data.timestamps.length; i++) {
        const ts = data.timestamps[i];
        if (ts) {
            dateSet.add(ts.split('T')[0].split(' ')[0]);
        }
    }
    return Array.from(dateSet).sort();
  }, [data]);

  useEffect(() => {
    setSelectedLocalDates(allDates);
  }, [allDates]);

  useEffect(() => {
    if (!data || !data.series || !selectedSeries.length || !allDates.length) {
        setProcessedData(null);
        return;
    }
    
    setProcessing(true);
    
    const timeoutId = setTimeout(() => {
        try {
            const size = parseFloat(binSize) || 50;
            const length = data.timestamps ? data.timestamps.length : 0;
            
            if (length === 0) {
                setProcessedData({ empty: true });
                setProcessing(false);
                return;
            }

            let globalMin = Infinity;
            let globalMax = -Infinity;
            
            const validData = {};
            
            selectedSeries.forEach(s => {
                if (data.series[s]) {
                    const vals = data.series[s];
                    const maskedVals = [];
                    for(let i = 0; i < length; i++) {
                        if (vals[i] !== null && vals[i] !== undefined && !isNaN(vals[i])) {
                            const val = parseFloat(vals[i]);
                            maskedVals.push({ val, index: i });
                            if (val < globalMin) globalMin = val;
                            if (val > globalMax) globalMax = val;
                        }
                    }
                    validData[s] = maskedVals;
                }
            });

            if (globalMin === Infinity) {
                setProcessedData({ empty: true });
                setProcessing(false);
                return;
            }

            const minBin = Math.floor(globalMin / size) * size;
            const maxBin = Math.ceil(globalMax / size) * size;
            
            const bins = [];
            if (size > 0) {
                for (let b = minBin; b < maxBin; b += size) {
                    bins.push({
                        start: b,
                        end: b + size,
                        label: `${b.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 2})} a ${(b + size).toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`
                    });
                }
                if (bins.length === 0) {
                   bins.push({
                       start: minBin, end: minBin + size,
                       label: `${minBin.toLocaleString('pt-BR')} a ${(minBin + size).toLocaleString('pt-BR')}`
                   })
                }
            }

            const dateStrToIndex = {};
            if (data.timestamps) {
                for (let i = 0; i < length; i++) {
                    const ts = data.timestamps[i];
                    if (!ts) continue;
                    const datePart = ts.split('T')[0].split(' ')[0];
                    dateStrToIndex[i] = datePart;
                }
            }
            
            const counts = {};
            allDates.forEach(d => {
                counts[d] = {};
                bins.forEach(bin => counts[d][bin.label] = 0);
            });
            const totalCounts = {};
            bins.forEach(bin => totalCounts[bin.label] = 0);

            selectedSeries.forEach(s => {
                if (validData[s]) {
                    validData[s].forEach(item => {
                        const { val, index } = item;
                        const d = dateStrToIndex[index];
                        if (d && counts[d] && size > 0) {
                            const binIndex = Math.floor((val - minBin) / size);
                            const safeBinIndex = Math.max(0, Math.min(binIndex, bins.length - 1));
                            const binLabel = bins[safeBinIndex].label;
                            
                            counts[d][binLabel]++;
                            if (selectedLocalDates.includes(d)) {
                                totalCounts[binLabel]++;
                            }
                        }
                    });
                }
            });

            let maxCount = 0;
            let maxTotal = 0;
            
            selectedLocalDates.forEach(d => {
                if (counts[d]) {
                    Object.values(counts[d]).forEach(val => {
                        if (val > maxCount) maxCount = val;
                    });
                }
            });
            Object.values(totalCounts).forEach(val => {
                if (val > maxTotal) maxTotal = val;
            });

            setProcessedData({
                bins,
                dates: selectedLocalDates.slice().sort(),
                allDates,
                counts,
                totalCounts,
                maxCount,
                maxTotal,
                validData,
                dateStrToIndex,
                minBin,
                size
            });
        } catch (err) {
            console.error("Error processing eventos extremos:", err);
            setProcessedData({ error: true });
        } finally {
            setProcessing(false);
        }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [data, binSize, selectedSeries, selectedLocalDates]);

  const [expandedRows, setExpandedRows] = useState(new Set());

  const getHeatmapColor = (value, max) => {
    if (!value || !max) return 'transparent';
    const intensity = Math.max(0, Math.min(1, value / max));
    return `rgba(245, 158, 11, ${intensity * 0.7})`;
  };

  const toggleRow = (label) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const getStratificationForBinAndDate = (bin, date) => {
    if (!processedData) return [];
    const durations = {};
    const { validData, dateStrToIndex, minBin, size, bins } = processedData;

    selectedSeries.forEach(s => {
        if (!validData[s]) return;
        let currentDuration = 0;
        let lastIndex = -2;
        
        validData[s].forEach(item => {
            const { val, index } = item;
            const d = dateStrToIndex[index];
            const matchesDate = (date === 'Total') ? selectedLocalDates.includes(d) : (d === date);
            
            if (matchesDate) {
                const binIndex = Math.floor((val - minBin) / size);
                const safeBinIndex = Math.max(0, Math.min(binIndex, bins.length - 1));
                const binLabel = bins[safeBinIndex].label;
                
                if (binLabel === bin.label) {
                    if (index === lastIndex + 1) {
                        currentDuration++;
                    } else {
                        if (currentDuration > 0) {
                            if (!durations[currentDuration]) durations[currentDuration] = { count: 0, series: {} };
                            durations[currentDuration].count++;
                            durations[currentDuration].series[s] = (durations[currentDuration].series[s] || 0) + 1;
                        }
                        currentDuration = 1;
                    }
                    lastIndex = index;
                }
            }
        });
        if (currentDuration > 0) {
            if (!durations[currentDuration]) durations[currentDuration] = { count: 0, series: {} };
            durations[currentDuration].count++;
            durations[currentDuration].series[s] = (durations[currentDuration].series[s] || 0) + 1;
        }
    });

    return Object.entries(durations)
        .map(([dur, data]) => ({ 
            duration: parseInt(dur), 
            count: data.count, 
            series: Object.entries(data.series).sort((a, b) => b[1] - a[1]) 
        }))
        .sort((a, b) => b.duration - a.duration);
  };

  const handlePrevDay = () => {
    if (selectedLocalDates.length !== 1) return;
    const idx = allDates.indexOf(selectedLocalDates[0]);
    if (idx > 0) setSelectedLocalDates([allDates[idx - 1]]);
  };

  const handleNextDay = () => {
    if (selectedLocalDates.length !== 1) return;
    const idx = allDates.indexOf(selectedLocalDates[0]);
    if (idx < allDates.length - 1) setSelectedLocalDates([allDates[idx + 1]]);
  };

  const toggleDateSelection = (d) => {
    if (selectedLocalDates.includes(d)) {
      setSelectedLocalDates(prev => prev.filter(x => x !== d));
    } else {
      setSelectedLocalDates(prev => [...prev, d].sort());
    }
  };

  const renderDateSelector = () => {
    if (!allDates || allDates.length === 0) return null;
    const isSingle = selectedLocalDates.length === 1;
    const idx = isSingle ? allDates.indexOf(selectedLocalDates[0]) : -1;
    const hasPrev = isSingle && idx > 0;
    const hasNext = isSingle && idx < allDates.length - 1;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
        {isSingle && (
          <button 
            onClick={handlePrevDay} 
            disabled={!hasPrev}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: hasPrev ? '#fff' : '#f1f5f9', cursor: hasPrev ? 'pointer' : 'not-allowed', color: hasPrev ? '#334155' : '#94a3b8' }}
          >
            ◀
          </button>
        )}
        
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowDatePicker(!showDatePicker)}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#0f172a', minWidth: 100 }}
          >
            {selectedLocalDates.length === 1 ? selectedLocalDates[0] : `${selectedLocalDates.length} dias`}
          </button>
          
          {showDatePicker && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowDatePicker(false)} />
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 100, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Dias Processados</div>
                {allDates.map(d => (
                  <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                    <input 
                      type="checkbox" 
                      checked={selectedLocalDates.includes(d)} 
                      onChange={() => toggleDateSelection(d)}
                    />
                    {d}
                  </label>
                ))}
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                   <button onClick={() => setSelectedLocalDates([...allDates])} style={{ flex: 1, padding: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: '#f1f5f9', borderRadius: 4 }}>Todos</button>
                   <button onClick={() => setSelectedLocalDates([])} style={{ flex: 1, padding: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: '#f1f5f9', borderRadius: 4 }}>Nenhum</button>
                </div>
              </div>
            </>
          )}
        </div>

        {isSingle && (
          <button 
            onClick={handleNextDay} 
            disabled={!hasNext}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: hasNext ? '#fff' : '#f1f5f9', cursor: hasNext ? 'pointer' : 'not-allowed', color: hasNext ? '#334155' : '#94a3b8' }}
          >
            ▶
          </button>
        )}
      </div>
    );
  };

  const hoverTimeoutRef = useRef(null);

  const [hoveredStrat, setHoveredStrat] = useState(null);

  const handleTooltipEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const handleTooltipLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredStrat(null);
    }, 200);
  };

  const renderTable = () => {
    if (loading) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div className="spinner" style={{ width: 40, height: 40, border: '4px solid var(--border)', borderTopColor: 'var(--amber)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ color: 'var(--text-muted)' }}>Buscando dados...</span>
        </div>
      );
    }

    if (processing) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div className="spinner" style={{ width: 40, height: 40, border: '4px solid var(--border)', borderTopColor: 'var(--amber)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ color: 'var(--text-muted)' }}>Processando tabela...</span>
        </div>
      );
    }
    
    if (processedData?.error) {
      return <ErrorState message="Erro ao processar dados." />;
    }
    
    if (processedData?.empty) {
      return <EmptyState message="Nenhum dado válido encontrado para as séries selecionadas." />;
    }
    
    if (!processedData) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Selecione as séries no menu lateral e clique em Visualizar para gerar a tabela.
        </div>
      );
    }

    return (
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {hoveredStrat && (
          <div 
            onMouseEnter={handleTooltipEnter}
            onMouseLeave={handleTooltipLeave}
            style={{
              position: 'fixed',
              top: hoveredStrat.y,
              left: hoveredStrat.x,
              background: '#fff',
              border: '1px solid var(--border)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              padding: '12px 16px',
              borderRadius: 8,
              zIndex: 9999,
              minWidth: 400,
              maxHeight: 300,
              overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
              Eventos de {hoveredStrat.strat.duration} min ({hoveredStrat.strat.count} ocorr.)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {hoveredStrat.strat.series.map(([sName, sCount], idx) => (
                 <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                   <span style={{ color: '#475569', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={sName}>{sName}</span>
                   <span style={{ fontWeight: 600, color: '#0f172a' }}>{sCount}x</span>
                 </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Distribuição de Frequência (Minutos)</h3>
            
            {renderDateSelector()}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Tamanho da Faixa (Bin Size):</label>
              <input 
                type="number" 
                className="input" 
                value={binSize} 
                onChange={(e) => setBinSize(e.target.value)}
                style={{ width: 80, padding: '4px 8px', fontSize: 13, minHeight: 28 }}
                min="0.001"
                step="any"
              />
            </div>
          </div>
          
          <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
            <button
                className="btn btn-secondary"
                style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#e2e8f0', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                onClick={() => exportTableToPng(tableRef.current, `Eventos_Extremos_${usina}.png`)}
                title="Exportar tabela atual como Imagem PNG"
            >
              🖼️ PNG
            </button>
            <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#ffffff', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                onClick={() => setShowExportMenu(!showExportMenu)}
                title="Exportar tabela atual para PDF"
            >
              📄 PDF
            </button>
            
            {showExportMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Orientação</div>
                <button 
                  onClick={() => { setShowExportMenu(false); exportTableToPdf(tableRef.current, `Eventos_Extremos_${usina}.pdf`, { usinaName: usina || 'N/D', forceOrientation: 'p' }) }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  📄 Retrato
                </button>
                <button 
                  onClick={() => { setShowExportMenu(false); exportTableToPdf(tableRef.current, `Eventos_Extremos_${usina}.pdf`, { usinaName: usina || 'N/D', forceOrientation: 'l' }) }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  📄 Paisagem
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-primary)' }}>
          <table ref={tableRef} className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 10 }}>
              <tr>
                <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', fontWeight: 600, minWidth: 120 }}>Faixa de Valores</th>
                {processedData.dates.map(d => (
                  <th key={d} style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', fontWeight: 600 }}>{d}</th>
                ))}
                <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '2px solid var(--border)', fontWeight: 600, color: 'var(--amber)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {processedData.bins.map((bin, idx) => (
                <React.Fragment key={bin.label}>
                  <tr style={{ background: 'var(--bg-card)' }}>
                    <td style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontWeight: 500, background: 'var(--bg-primary)' }}>
                      <button 
                        onClick={() => toggleRow(bin.label)} 
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', marginRight: 8, fontSize: 14, fontWeight: 'bold', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', ':hover': { background: 'var(--bg-secondary)' } }}
                      >
                        {expandedRows.has(bin.label) ? '-' : '+'}
                      </button>
                      {bin.label}
                    </td>
                    {processedData.dates.map(d => {
                      const val = processedData.counts[d][bin.label];
                      return (
                        <td 
                          key={d} 
                          style={{ 
                            padding: '8px 16px', 
                            borderBottom: '1px solid var(--border)', 
                            borderRight: '1px solid var(--border)', 
                            textAlign: 'right', 
                            color: val > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                            background: getHeatmapColor(val, processedData.maxCount)
                          }}
                        >
                          {val.toLocaleString('pt-BR')}
                        </td>
                      );
                    })}
                    <td 
                      style={{ 
                        padding: '8px 16px', 
                        borderBottom: '1px solid var(--border)', 
                        textAlign: 'right', 
                        fontWeight: 600, 
                        color: 'var(--text-primary)',
                        background: getHeatmapColor(processedData.totalCounts[bin.label], processedData.maxTotal)
                      }}
                    >
                      {processedData.totalCounts[bin.label].toLocaleString('pt-BR')}
                    </td>
                  </tr>
                  
                  {expandedRows.has(bin.label) && (
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', verticalAlign: 'top', background: '#f8fafc' }}>
                         <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Estratificação<br/>(Minutos x Ocorrências)</div>
                      </td>
                      {processedData.dates.map(d => {
                         const strat = getStratificationForBinAndDate(bin, d);
                         return (
                           <td key={d} style={{ padding: '8px 16px', borderRight: '1px solid var(--border)', verticalAlign: 'top', background: '#f8fafc' }}>
                             {strat.length > 0 ? strat.map((r, i) => (
                               <div 
                                 key={i} 
                                 onMouseEnter={e => {
                                   handleTooltipEnter();
                                   const rect = e.currentTarget.getBoundingClientRect();
                                   setHoveredStrat({ x: rect.left, y: rect.bottom + 5, strat: r });
                                 }}
                                 onMouseLeave={handleTooltipLeave}
                                 style={{ fontSize: 13, display: 'flex', justifyContent: 'flex-end', gap: 12, borderBottom: i < strat.length - 1 ? '1px solid #e2e8f0' : 'none', paddingBottom: i < strat.length - 1 ? 4 : 0, marginBottom: i < strat.length - 1 ? 4 : 0, cursor: 'help' }}
                               >
                                 <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.duration} min</span>
                                 <span style={{ color: 'var(--text-muted)' }}>{r.count} ocorr.</span>
                               </div>
                             )) : <div style={{ fontSize: 13, textAlign: 'right', color: 'var(--text-muted)' }}>-</div>}
                           </td>
                         );
                      })}
                      <td style={{ padding: '8px 16px', verticalAlign: 'top', background: '#f8fafc' }}>
                         {(() => {
                           const strat = getStratificationForBinAndDate(bin, 'Total');
                           return strat.length > 0 ? strat.map((r, i) => (
                             <div 
                               key={i} 
                               onMouseEnter={e => {
                                 handleTooltipEnter();
                                 const rect = e.currentTarget.getBoundingClientRect();
                                 setHoveredStrat({ x: rect.left - 100, y: rect.bottom + 5, strat: r });
                               }}
                               onMouseLeave={handleTooltipLeave}
                               style={{ fontSize: 13, display: 'flex', justifyContent: 'flex-end', gap: 12, borderBottom: i < strat.length - 1 ? '1px solid #e2e8f0' : 'none', paddingBottom: i < strat.length - 1 ? 4 : 0, marginBottom: i < strat.length - 1 ? 4 : 0, cursor: 'help' }}
                             >
                               <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.duration} min</span>
                               <span style={{ color: 'var(--text-muted)' }}>{r.count} ocorr.</span>
                             </div>
                           )) : <div style={{ fontSize: 13, textAlign: 'right', color: 'var(--text-muted)' }}>-</div>;
                         })()}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          
          {processedData.bins.length > 0 && (
            <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <Plot
                data={[
                  ...processedData.dates.map((d, i) => {
                    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#6366f1', '#14b8a6'];
                    return {
                      x: processedData.bins.map(b => b.start + (processedData.size / 2)),
                      y: processedData.bins.map(b => processedData.counts[d][b.label]),
                      type: 'scatter',
                      mode: 'lines',
                      name: d,
                      line: { color: colors[i % colors.length], width: 2, shape: 'spline' }
                    };
                  }),
                  {
                    x: processedData.bins.map(b => b.start + (processedData.size / 2)),
                    y: processedData.bins.map(b => processedData.totalCounts[b.label]),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Total',
                    line: { color: '#ef4444', width: 3, dash: 'dot', shape: 'spline' }
                  }
                ]}
                layout={{
                  autosize: true,
                  margin: { t: 40, r: 20, l: 60, b: 60 },
                  title: 'Distribuição de Valores',
                  xaxis: { title: 'Valores (Centro da Faixa)', type: 'linear' },
                  yaxis: { title: 'Frequência (Minutos)' },
                  hovermode: 'closest',
                  legend: { orientation: 'h', y: -0.3, x: 0.5, xanchor: 'center' },
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { family: 'Inter, sans-serif' }
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '400px' }}
                config={{ displayModeBar: false }}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16 }}>
      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {renderTable()}
      </div>
    </div>
  );
}
