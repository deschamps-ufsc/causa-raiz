import React, { useState } from 'react';
import { useSeries } from '../hooks/useSeries';
import { formatSeriesName } from './SeriesSelector';
import PlotWrapper from 'react-plotly.js';
const Plot = PlotWrapper.default || PlotWrapper;

const formatPValue = (p) => {
  if (p == null || isNaN(p)) return 'N/A';
  if (p < 0.001) return '< 0,001';
  return p.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
};

const calculateRcMetrics = (g_median, g_iqr, g_min, g_max, t_median, t_iqr, t_min, t_max, rcG, rcT) => {
  if (g_iqr == null || t_iqr == null || g_iqr < 0.001 || t_iqr < 0.001) {
    return { distance: null, ei: null, dG: null, dT: null };
  }
  const dG = Math.abs(rcG - g_median) / (g_iqr / 1.349);
  const dT = Math.abs(rcT - t_median) / (t_iqr / 1.349);
  const D = Math.sqrt((Math.pow(dG, 2) + Math.pow(dT, 2)) / 2);
  
  let eG = 0;
  if (rcG < g_min) eG = (g_min - rcG) / (g_iqr / 1.349);
  else if (rcG > g_max) eG = (rcG - g_max) / (g_iqr / 1.349);

  let eT = 0;
  if (rcT < t_min) eT = (t_min - rcT) / (t_iqr / 1.349);
  else if (rcT > t_max) eT = (rcT - t_max) / (t_iqr / 1.349);

  const ei = Math.sqrt((Math.pow(eG, 2) + Math.pow(eT, 2)) / 2);
  return { distance: D, ei: ei, dG: dG, dT: dT };
};

const getQualityScore = (r2, pMax, errorStat) => {
  if (errorStat) {
    return { icon: '🔴', text: 'Erro estatístico', color: '#fef2f2', border: '#fca5a5', reason: errorStat };
  }
  if (r2 == null || isNaN(r2)) {
    return { icon: '⚪', text: 'N/A', color: '#f8fafc', border: '#e2e8f0', reason: 'Dados insuficientes.' };
  }
  if (r2 < 0.60) {
    return { icon: '🔴', text: 'Muito baixa', color: '#fef2f2', border: '#fca5a5', reason: 'R² menor que 0,60.' };
  }
  const hasBadPValue = pMax != null && pMax > 0.05;
  if (r2 >= 0.60 && r2 < 0.80) {
    return { icon: '🟠', text: 'Baixa', color: '#fff7ed', border: '#fdba74', reason: 'R² entre 0,60 e 0,80.' };
  }
  if (r2 >= 0.80 && r2 < 0.90) {
    if (hasBadPValue) {
      return { icon: '🟠', text: 'Baixa', color: '#fff7ed', border: '#fdba74', reason: 'R² entre 0,80 e 0,90, porém p-value > 0,05.' };
    }
    return { icon: '🟡', text: 'Atenção', color: '#fefce8', border: '#fde047', reason: 'R² entre 0,80 e 0,90 e p-value <= 0,05.' };
  }
  if (r2 >= 0.90) {
    if (hasBadPValue) {
      return { icon: '🟡', text: 'Atenção', color: '#fefce8', border: '#fde047', reason: 'R² >= 0,90, porém p-value > 0,05.' };
    }
    return { icon: '🟢', text: 'Boa', color: '#f0fdf4', border: '#86efac', reason: 'R² >= 0,90 e p-value <= 0,05.' };
  }
  return { icon: '⚪', text: 'Desconhecida', color: '#f8fafc', border: '#e2e8f0', reason: 'Critérios não identificados.' };
};

const CapacityTestView = ({ usinaAtual, selectedDates, setCapacityTestDailyResults }) => {
  const { series, loading: seriesLoading } = useSeries(selectedDates, usinaAtual);

  const [gMin, setGMin] = useState(() => Number(localStorage.getItem('capacityTestGMin')) || 400);
  const [gMax, setGMax] = useState(() => Number(localStorage.getItem('capacityTestGMax')) || 1200);
  
  const [pSeries, setPSeries] = useState(() => localStorage.getItem('capacityTestPSeries') || '');
  const [gSeries, setGSeries] = useState(() => localStorage.getItem('capacityTestGSeries') || '');
  const [tSeries, setTSeries] = useState(() => localStorage.getItem('capacityTestTSeries') || '');
  
  const [pSeriesSim, setPSeriesSim] = useState(() => localStorage.getItem('capacityTestPSeriesSim') || '');
  const [gSeriesSim, setGSeriesSim] = useState(() => localStorage.getItem('capacityTestGSeriesSim') || '');
  const [tSeriesSim, setTSeriesSim] = useState(() => localStorage.getItem('capacityTestTSeriesSim') || '');
  
  const [rcG, setRcG] = useState(() => {
    const saved = localStorage.getItem('capacityTestRcG');
    return saved !== null ? Number(saved) : 1000;
  });
  const [rcT, setRcT] = useState(() => {
    const saved = localStorage.getItem('capacityTestRcT');
    return saved !== null ? Number(saved) : 25;
  });
  
  const [resolution, setResolution] = useState(() => localStorage.getItem('capacityTestResolution') || '1 min');
  const [astmWindow, setAstmWindow] = useState(() => parseInt(localStorage.getItem('capacityTestAstmWindow')) || 5);

  React.useEffect(() => {
    localStorage.setItem('capacityTestGMin', gMin);
    localStorage.setItem('capacityTestGMax', gMax);
    localStorage.setItem('capacityTestPSeries', pSeries);
    localStorage.setItem('capacityTestGSeries', gSeries);
    localStorage.setItem('capacityTestTSeries', tSeries);
    localStorage.setItem('capacityTestPSeriesSim', pSeriesSim);
    localStorage.setItem('capacityTestGSeriesSim', gSeriesSim);
    localStorage.setItem('capacityTestTSeriesSim', tSeriesSim);
    localStorage.setItem('capacityTestRcG', rcG);
    localStorage.setItem('capacityTestRcT', rcT);
    localStorage.setItem('capacityTestResolution', resolution);
    localStorage.setItem('capacityTestAstmWindow', astmWindow.toString());
  }, [gMin, gMax, pSeries, gSeries, tSeries, pSeriesSim, gSeriesSim, tSeriesSim, rcG, rcT, resolution, astmWindow]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [resultsSim, setResultsSim] = useState(null);
  const [error, setError] = useState(null);

  const [progressMedido, setProgressMedido] = useState(null);
  const [progressSimulado, setProgressSimulado] = useState(null);

  const [expandedRow, setExpandedRow] = useState(null);
  const toggleRow = (date) => {
    setExpandedRow(prev => prev === date ? null : date);
  };

  const fetchSSE = async (url, payload, setProgress) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errText = await res.text();
      let detail = errText;
      try { detail = JSON.parse(errText).detail || errText; } catch(e){}
      throw new Error(detail);
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let result = null;
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Última linha incompleta
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.error) throw new Error(data.error);
          if (data.status === 'progress') {
            setProgress(data);
          }
          if (data.status === 'completed') {
            result = data.result;
          }
        } catch (e) {
          if (e.message !== "Unexpected end of JSON input" && !e.message.includes("Unexpected token")) {
              throw e;
          }
        }
      }
    }
    return result;
  };

  const { pSeriesOptions, gSeriesOptions, tSeriesOptions, pvsystSeriesOptions, pvlibSeriesOptions } = React.useMemo(() => {
    if (!series) return { pSeriesOptions: [], gSeriesOptions: [], tSeriesOptions: [], pvsystSeriesOptions: [], pvlibSeriesOptions: [] };
    
    const pOptions = [];
    const gOptions = [];
    const tOptions = [];
    const pvsyst = [];
    const pvlib = [];
    
    series.forEach(s => {
      const isBruta = s.coluna.startsWith('CTG') || s.coluna.startsWith('INV') || s.coluna.startsWith('TR');
      const isValida = (s.sintetica || s.processada) && !isBruta;

      if (isValida) {
        if (s.elemento?.toLowerCase() === 'pvsyst') {
          pvsyst.push(s.coluna);
        } else if (s.elemento?.toLowerCase() === 'pvlib') {
          pvlib.push(s.coluna);
        } else {
          if (s.elemento === 'Energia PMI') pOptions.push(s.coluna);
          else if (s.elemento === 'Irradiação') gOptions.push(s.coluna);
          else if (s.elemento === 'Temperatura') tOptions.push(s.coluna);
        }
      }
    });

    const sortFn = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    
    return {
      pSeriesOptions: pOptions.sort(sortFn),
      gSeriesOptions: gOptions.sort(sortFn),
      tSeriesOptions: tOptions.sort(sortFn),
      pvsystSeriesOptions: pvsyst.sort(sortFn),
      pvlibSeriesOptions: pvlib.sort(sortFn)
    };
  }, [series]);

  const handleProcess = async () => {
    if (!usinaAtual || !selectedDates || selectedDates.length === 0) {
      setError("Selecione uma usina e datas válidas.");
      return;
    }
    
    const hasMeasured = pSeries && gSeries && tSeries;
    const hasSimulated = pSeriesSim && gSeriesSim && tSeriesSim;
    
    if (!hasMeasured && !hasSimulated) {
      setError("Preencha ao menos as três séries de um dos blocos (Medidos ou Simulados).");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setResultsSim(null);

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

    try {
      setProgressMedido(hasMeasured ? { progress: 0, total: selectedDates.length, current_day: 'Iniciando...' } : null);
      setProgressSimulado(hasSimulated ? { progress: 0, total: selectedDates.length, current_day: 'Iniciando...' } : null);

      const promises = [];
      
      if (hasMeasured) {
        const payload = {
          usina: usinaAtual, dates: selectedDates,
          p_series: pSeries, g_series: gSeries, t_series: tSeries,
          g_min: Number(gMin), g_max: Number(gMax), resolution: resolution, astm_window: astmWindow
        };
        const p1 = fetchSSE(`${baseUrl}/capacity-test/process-stream`, payload, setProgressMedido)
          .then(data => { setResults(data); setProgressMedido(null); return data; })
          .catch(err => { setProgressMedido(null); throw err; });
        promises.push(p1);
      }
      
      if (hasSimulated) {
        const payloadSim = {
          usina: usinaAtual, dates: selectedDates,
          p_series: pSeriesSim, g_series: gSeriesSim, t_series: tSeriesSim,
          g_min: Number(gMin), g_max: Number(gMax), resolution: resolution, astm_window: astmWindow
        };
        const p2 = fetchSSE(`${baseUrl}/capacity-test/process-stream`, payloadSim, setProgressSimulado)
          .then(data => { setResultsSim(data); setProgressSimulado(null); return data; })
          .catch(err => { setProgressSimulado(null); throw err; });
        promises.push(p2);
      }

      const resultsArray = await Promise.all(promises);
      
      const r1 = hasMeasured ? resultsArray[0] : null;
      const r2 = hasSimulated ? resultsArray[hasMeasured ? 1 : 0] : null;

      const dailyMerged = {};
      const dates = new Set([
        ...(r1?.daily_results ? Object.keys(r1.daily_results) : []),
        ...(r2?.daily_results ? Object.keys(r2.daily_results) : [])
      ]);

      dates.forEach(date => {
        const d1 = r1?.daily_results?.[date];
        const d2 = r2?.daily_results?.[date];
        
        const pMedido = d1 ? (d1.a1 * rcG + d1.a2 * Math.pow(rcG, 2) + d1.a3 * rcG * rcT) : null;
        const pSimulado = d2 ? (d2.a1 * rcG + d2.a2 * Math.pow(rcG, 2) + d2.a3 * rcG * rcT) : null;
        const ratio = pMedido && pSimulado ? (pMedido / pSimulado) * 100 : null;

        const gP60Daily = d1?.g_p60 != null ? d1.g_p60 : null;
        const tMeanDaily = d1?.t_mean != null ? d1.t_mean : null;
        const pMedidoAdaptive = d1 && gP60Daily != null ? (d1.a1 * gP60Daily + d1.a2 * Math.pow(gP60Daily, 2) + d1.a3 * gP60Daily * tMeanDaily) : null;
        const pSimuladoAdaptive = d2 && gP60Daily != null ? (d2.a1 * gP60Daily + d2.a2 * Math.pow(gP60Daily, 2) + d2.a3 * gP60Daily * tMeanDaily) : null;
        const ratioAdaptive = pMedidoAdaptive && pSimuladoAdaptive ? (pMedidoAdaptive / pSimuladoAdaptive) * 100 : null;

        const astmMed = r1?.astm_results?.[date];
        const astmSim = r2?.astm_results?.[date];
        const astmPMedido = astmMed ? (astmMed.a1 * rcG + astmMed.a2 * Math.pow(rcG, 2) + astmMed.a3 * rcG * rcT) : null;
        const astmPSimulado = astmSim ? (astmSim.a1 * rcG + astmSim.a2 * Math.pow(rcG, 2) + astmSim.a3 * rcG * rcT) : null;
        const astmRatio = astmPMedido && astmPSimulado ? (astmPMedido / astmPSimulado) * 100 : null;

        const gP60Astm = astmMed?.g_p60 != null ? astmMed.g_p60 : null;
        const tMeanAstm = astmMed?.t_mean != null ? astmMed.t_mean : null;
        const astmPMedidoAdaptive = astmMed && gP60Astm != null ? (astmMed.a1 * gP60Astm + astmMed.a2 * Math.pow(gP60Astm, 2) + astmMed.a3 * gP60Astm * tMeanAstm) : null;
        const astmPSimuladoAdaptive = astmSim && gP60Astm != null ? (astmSim.a1 * gP60Astm + astmSim.a2 * Math.pow(gP60Astm, 2) + astmSim.a3 * gP60Astm * tMeanAstm) : null;
        const astmRatioAdaptive = astmPMedidoAdaptive && astmPSimuladoAdaptive ? (astmPMedidoAdaptive / astmPSimuladoAdaptive) * 100 : null;

        dailyMerged[date] = {
          pMedido,
          pSimulado,
          ratio,
          pMedidoAdaptive,
          pSimuladoAdaptive,
          ratioAdaptive,
          astmPMedido,
          astmPSimulado,
          astmRatio,
          astmPMedidoAdaptive,
          astmPSimuladoAdaptive,
          astmRatioAdaptive,
          astmWindow: astmWindow,
          r2Medido: d1?.r2,
          rmseMedido: d1?.rmse,
          r2Simulado: d2?.r2,
          rmseSimulado: d2?.rmse
        };
      });

      if (setCapacityTestDailyResults) {
        setCapacityTestDailyResults(prev => {
          const updated = { ...prev, ...dailyMerged };
          const baseUrlStr = typeof baseUrl !== 'undefined' ? baseUrl : (import.meta.env.VITE_API_URL || 'http://localhost:8000');
          fetch(`${baseUrlStr}/capacity-test/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usina: usinaAtual, results: updated })
          }).catch(e => console.error("Erro ao salvar capacity test results:", e));
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getEnvelopeStatus = (res) => {
    if (!res || !res.data_ranges) return { status: '', label: '', extrapolate: false, percentilWarning: null };
    const { G, Tamb } = res.data_ranges;
    const gOut = rcG < G.min || rcG > G.max;
    const tOut = rcT < Tamb.min || rcT > Tamb.max;
    
    let percentilWarning = null;
    if (!gOut && !tOut) {
      if (rcG < G.p10 || rcG > G.p90 || rcT < Tamb.p10 || rcT > Tamb.p90) {
        percentilWarning = "RC próxima às extremidades (< P10 ou > P90)";
      }
    }
    
    if (gOut && tOut) return { status: 'fora', label: '🔴 RC fora do envelope dos dados', extrapolate: true, percentilWarning };
    if (gOut || tOut) return { status: 'parcial', label: '🟠 RC parcialmente fora do envelope', extrapolate: true, percentilWarning };
    return { status: 'dentro', label: '🟢 Dentro do envelope dos dados', extrapolate: false, percentilWarning };
  };

  const renderSelect = (label, val, setVal) => (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>{label}</label>
      <select 
        value={val} onChange={e => setVal(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', background: '#fff' }}
      >
        <option value="">Selecione...</option>
        <optgroup label="Séries Processadas">
          {pSeriesOptions.map(s => <option key={`proc-${s}`} value={s}>{formatSeriesName(s)}</option>)}
          {gSeriesOptions.map(s => <option key={`proc-${s}`} value={s}>{formatSeriesName(s)}</option>)}
          {tSeriesOptions.map(s => <option key={`proc-${s}`} value={s}>{formatSeriesName(s)}</option>)}
        </optgroup>
        <optgroup label="Séries PVSYST">
          {pvsystSeriesOptions.map(s => <option key={`pvsyst-${s}`} value={s}>{formatSeriesName(s)}</option>)}
        </optgroup>
        <optgroup label="Séries PVLib">
          {pvlibSeriesOptions.map(s => <option key={`pvlib-${s}`} value={s}>{formatSeriesName(s)}</option>)}
        </optgroup>
      </select>
    </div>
  );

  const renderResultsBlock = (res, title, typeColor) => {
    if (!res || res.status !== "ok") return null;
    const envStatus = getEnvelopeStatus(res);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: `1px solid ${typeColor}` }}>
        <h3 style={{ margin: 0, paddingBottom: '8px', borderBottom: `2px solid ${typeColor}`, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        
        {/* Resultado de Potência */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'flex', padding: '16px', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Potência (P) Estimada</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: typeColor, marginTop: '4px' }}>
                { (res.a1 * rcG + res.a2 * Math.pow(rcG, 2) + res.a3 * rcG * rcT).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                G = {rcG} W/m² | T = {rcT} °C
              </div>
            </div>
          </div>
        </div>

        {/* Resultados Numéricos (Coeficientes) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
          {['a1', 'a2', 'a3'].map((k, i) => (
            <div key={k} style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{['a₁ (G)', 'a₂ (G²)', 'a₃ (G·T)'][i]}</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{res[k].toExponential(3)}</div>
            </div>
          ))}
        </div>

        {/* Diagnóstico da Regressão */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>R² Score</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: typeColor, marginTop: '2px' }}>{res.r2.toFixed(4)}</div>
          </div>
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Pontos Válidos</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{res.n_points.toLocaleString('pt-BR')}</div>
          </div>
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>RMSE</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#f59e0b', marginTop: '2px' }}>{res.rmse?.toFixed(2)}</div>
          </div>
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>MAE</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#3b82f6', marginTop: '2px' }}>{res.mae?.toFixed(2)}</div>
          </div>
        </div>

        <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Envelope RC</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: envStatus.status === 'dentro' ? '#10b981' : envStatus.status === 'parcial' ? '#f59e0b' : '#ef4444', marginTop: '2px' }}>
            {envStatus.label}
          </div>
          {res.data_ranges && (
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              G: {res.data_ranges.G.min.toFixed(0)}~{res.data_ranges.G.max.toFixed(0)} | T: {res.data_ranges.Tamb.min.toFixed(1)}~{res.data_ranges.Tamb.max.toFixed(1)}
            </div>
          )}
          {envStatus.extrapolate && <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '4px' }}>Aviso: Extrapolação.</div>}
          {envStatus.percentilWarning && !envStatus.extrapolate && <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '4px' }}>Aviso: {envStatus.percentilWarning}.</div>}
        </div>

        {/* Tabela de Coeficientes */}
        {res.coefficient_statistics && (
          <div style={{ background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '6px 12px', fontWeight: 600 }}>Coef</th>
                  <th style={{ padding: '6px 12px', fontWeight: 600 }}>Erro Pad.</th>
                  <th style={{ padding: '6px 12px', fontWeight: 600 }}>p-value</th>
                </tr>
              </thead>
              <tbody>
                {['a1', 'a2', 'a3'].map((k, idx) => {
                  const s = res.coefficient_statistics[k];
                  const labels = { a1: 'a₁', a2: 'a₂', a3: 'a₃' };
                  return (
                    <tr key={k} style={{ borderBottom: idx < 2 ? '1px solid #e2e8f0' : 'none' }}>
                      <td style={{ padding: '6px 12px', fontWeight: 600 }}>{labels[k]}</td>
                      <td style={{ padding: '6px 12px', color: '#475569' }}>{s.se.toExponential(3)}</td>
                      <td style={{ padding: '6px 12px', color: '#475569' }}>{s.p_value.toExponential(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderCharts = (res, title) => {
    if (!res || !res.plot_data) return null;
    
    const safeMax = (arr) => arr && arr.length ? arr.reduce((a, b) => Math.max(a, b), -Infinity) : 0;
    const safeMin = (arr) => arr && arr.length ? arr.reduce((a, b) => Math.min(a, b), Infinity) : 0;

    return (
      <div style={{ marginTop: '20px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-color)', marginBottom: '16px' }}>{title}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ width: '48%', height: '300px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
            <Plot
              data={[
                { x: res.plot_data.P_prevista, y: res.plot_data.P_medida, mode: 'markers', type: 'scatter', marker: { size: 4, color: 'purple', opacity: 0.5 }, name: 'Dados' },
                { x: [safeMin(res.plot_data.P_prevista), safeMax(res.plot_data.P_prevista)], y: [safeMin(res.plot_data.P_prevista), safeMax(res.plot_data.P_prevista)], type: 'scatter', mode: 'lines', line: { color: 'red', dash: 'dash' }, name: 'y=x' }
              ]}
              layout={{ title: 'Medida vs Prevista', xaxis: { title: 'P Prevista' }, yaxis: { title: 'P Medida' }, margin: { l: 50, r: 20, t: 40, b: 40 } }}
              style={{ width: '100%', height: '100%' }}
              config={{ responsive: true, displayModeBar: false }}
            />
          </div>
          <div style={{ width: '48%', height: '300px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
            <Plot
              data={[
                { x: res.plot_data.G, y: res.plot_data.residuals, mode: 'markers', type: 'scatter', marker: { size: 4, color: 'blue', opacity: 0.5 }, name: 'Resíduos' },
                { x: [safeMin(res.plot_data.G), safeMax(res.plot_data.G)], y: [0, 0], type: 'scatter', mode: 'lines', line: { color: 'red', dash: 'dash' }, name: 'y=0' }
              ]}
              layout={{ title: 'Resíduos vs Irradiância', xaxis: { title: 'G' }, yaxis: { title: 'Resíduo' }, margin: { l: 50, r: 20, t: 40, b: 40 } }}
              style={{ width: '100%', height: '100%' }}
              config={{ responsive: true, displayModeBar: false }}
            />
          </div>
          <div style={{ width: '48%', height: '300px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
            <Plot
              data={[
                { x: res.plot_data.Tamb, y: res.plot_data.residuals, mode: 'markers', type: 'scatter', marker: { size: 4, color: 'green', opacity: 0.5 }, name: 'Resíduos' },
                { x: [safeMin(res.plot_data.Tamb), safeMax(res.plot_data.Tamb)], y: [0, 0], type: 'scatter', mode: 'lines', line: { color: 'red', dash: 'dash' }, name: 'y=0' }
              ]}
              layout={{ title: 'Resíduos vs Temperatura', xaxis: { title: 'T' }, yaxis: { title: 'Resíduo' }, margin: { l: 50, r: 20, t: 40, b: 40 } }}
              style={{ width: '100%', height: '100%' }}
              config={{ responsive: true, displayModeBar: false }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#0f172a', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🔋 Capacity Test
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
          Realiza regressão linear múltipla de dados medidos e/ou simulados: <strong>P = a₁·G + a₂·G² + a₃·G·T</strong>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>Filtros de Irradiância</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>Mínimo (W/m²)</label>
              <input type="number" value={gMin} onChange={e => setGMin(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>Máximo (W/m²)</label>
              <input type="number" value={gMax} onChange={e => setGMax(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>Fixed Reporting Conditions</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>Irradiância (W/m²)</label>
              <input type="number" value={rcG} onChange={e => setRcG(Number(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>Temperatura (°C)</label>
              <input type="number" value={rcT} onChange={e => setRcT(Number(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>Adaptive Reporting Conditions</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>
            Método: <strong>G: P60 / T: Média</strong><br/>
            Irradiância Adaptive RC: <em>60th percentile of filtered POA irradiance</em><br/>
            Temperatura Adaptive RC: <em>Arithmetic mean of filtered ambient temperature</em>
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', borderTop: '4px solid #3b82f6' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>Variáveis (Dados Medidos)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {renderSelect("Potência AC (P)", pSeries, setPSeries)}
            {renderSelect("Irradiância (G)", gSeries, setGSeries)}
            {renderSelect("Temperatura (T)", tSeries, setTSeries)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', borderTop: '4px solid #10b981' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>Variáveis (Dados Simulados)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {renderSelect("Potência AC (P)", pSeriesSim, setPSeriesSim)}
            {renderSelect("Irradiância (G)", gSeriesSim, setGSeriesSim)}
            {renderSelect("Temperatura (T)", tSeriesSim, setTSeriesSim)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>Resolução do Capacity Test</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setResolution('1 min')}
              style={{ 
                padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                background: resolution === '1 min' ? '#e0f2fe' : '#fff',
                borderColor: resolution === '1 min' ? '#3b82f6' : '#cbd5e1',
                color: resolution === '1 min' ? '#1d4ed8' : '#475569'
              }}
            >
              1 min
            </button>
            <button 
              onClick={() => setResolution('15 min')}
              style={{ 
                padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                background: resolution === '15 min' ? '#e0f2fe' : '#fff',
                borderColor: resolution === '15 min' ? '#3b82f6' : '#cbd5e1',
                color: resolution === '15 min' ? '#1d4ed8' : '#475569'
              }}
            >
              15 min
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>Janela ASTM (Dias Válidos)</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[3, 5, 10].map(val => (
              <button 
                key={val}
                onClick={() => setAstmWindow(val)}
                style={{ 
                  padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                  background: astmWindow === val ? '#e0f2fe' : '#fff',
                  borderColor: astmWindow === val ? '#3b82f6' : '#cbd5e1',
                  color: astmWindow === val ? '#1d4ed8' : '#475569'
                }}
              >
                {val} dias
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
        <button 
          onClick={handleProcess}
          disabled={loading || seriesLoading}
          style={{
            padding: '10px 24px', background: loading || seriesLoading ? '#94a3b8' : '#3b82f6',
            color: '#fff', border: 'none', borderRadius: '6px', cursor: loading || seriesLoading ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: '14px'
          }}
        >
          {loading ? 'Calculando...' : '▶ Processar Regressões'}
        </button>
        {seriesLoading && <span style={{ fontSize: '13px', color: '#64748b' }}>Carregando séries...</span>}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', border: '1px solid #fca5a5' }}>
          <strong>Atenção:</strong> {error}
        </div>
      )}

      {/* Progresso - Medidos */}
      {progressMedido && (
        <div style={{ marginTop: '20px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
            <span>Processando Regressões (Dados Medidos)</span>
            <span>{progressMedido.current_day} ({progressMedido.progress}/{progressMedido.total})</span>
          </div>
          <div style={{ height: '8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: '#4ade80', width: `${Math.max(5, (progressMedido.progress / (progressMedido.total || 1)) * 100)}%`, transition: 'width 0.3s' }}></div>
          </div>
        </div>
      )}

      {/* Progresso - Simulados */}
      {progressSimulado && (
        <div style={{ marginTop: '20px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
            <span>Processando Regressões (Dados Simulados)</span>
            <span>{progressSimulado.current_day} ({progressSimulado.progress}/{progressSimulado.total})</span>
          </div>
          <div style={{ height: '8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: '#3b82f6', width: `${Math.max(5, (progressSimulado.progress / (progressSimulado.total || 1)) * 100)}%`, transition: 'width 0.3s' }}></div>
          </div>
        </div>
      )}

      {(results || resultsSim) && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {results && resultsSim && results.status === 'ok' && resultsSim.status === 'ok' && (
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Capacity Ratio (Medido / Simulado)</div>
              <div style={{ fontSize: '48px', fontWeight: 800, color: '#0f172a', marginTop: '8px' }}>
                { (
                  ( (results.a1 * rcG + results.a2 * Math.pow(rcG, 2) + results.a3 * rcG * rcT) / 
                  (resultsSim.a1 * rcG + resultsSim.a2 * Math.pow(rcG, 2) + resultsSim.a3 * rcG * rcT) ) * 100
                ).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }%
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: results && resultsSim ? '1fr 1fr' : '1fr', gap: '20px' }}>
            {results && renderResultsBlock(results, "📊 Regressão (Dados Medidos)", "#3b82f6")}
            {resultsSim && renderResultsBlock(resultsSim, "📈 Regressão (Dados Simulados)", "#10b981")}
          </div>

          {results && (
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Gráficos (Dados Medidos)</h3>
              {renderCharts(results, 'Dados Medidos')}
            </div>
          )}
          
          {resultsSim && (
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Gráficos (Dados Simulados)</h3>
              {renderCharts(resultsSim, 'Dados Simulados')}
            </div>
          )}

          {/* Diagnostics Section */}
          {results?.resolution === '15 min' && results?.diagnostics_15min && (
            <div style={{ marginTop: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <h3 style={{ margin: 0, padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                ⏱️ Diagnóstico de Agregação (15 minutos)
              </h3>
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total de Blocos</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#334155' }}>{results.diagnostics_15min.total_blocks}</div>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Blocos Completos</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#15803d' }}>{results.diagnostics_15min.complete_blocks}</div>
                  </div>
                  <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: 600, textTransform: 'uppercase' }}>Blocos Incompletos</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#b91c1c' }}>{results.diagnostics_15min.incomplete_blocks}</div>
                  </div>
                  <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600, textTransform: 'uppercase' }}>Pontos Utilizados</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#1d4ed8' }}>{results.diagnostics_15min.complete_blocks}</div>
                  </div>
                </div>

                {results.diagnostics_15min.incomplete_details?.length > 0 && (
                  <details style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                    <summary style={{ fontWeight: 600, color: '#334155', cursor: 'pointer', outline: 'none' }}>Ver Blocos Excluídos por Dados Incompletos</summary>
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                      {results.diagnostics_15min.incomplete_details.map((block, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#475569', fontFamily: 'monospace' }}>{block.time}</span>
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>{block.count}/15 pontos</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* Tabela de Resultados Diários */}
          {(results?.daily_results || resultsSim?.daily_results) && (
            <div style={{ marginTop: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <h3 style={{ margin: 0, padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                📅 Resultados Diários (Capacity Test)
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Data</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Resolução</th>
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>P. RC Medido (kW)</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>R² (Medido)</th>}
                      {resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>P. RC Simulado (kW)</th>}
                      {resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>R² (Simulado)</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Pontos Válidos</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0', cursor: 'help' }} title="P-value máximo entre os coeficientes a1, a2 e a3">P-value</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Quality</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily Capacity Ratio — Fixed RC (%)</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily Capacity Ratio — Adaptive RC (%)</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily Mediana G</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily IQR G</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily dG</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily Mediana Tamb</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily IQR Tamb</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Daily dT</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0', cursor: 'help' }} title="Distância estatística normalizada entre a Reporting Condition e o centro da distribuição dos dados utilizados na regressão.">Daily RC Distance</th>}
                      {results && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0', cursor: 'help' }} title="Indica se a Reporting Condition está fora da faixa dos dados ambientais utilizados na regressão e mede a severidade dessa extrapolação.">Daily RC Extrapolation Index</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM Capacity Ratio — Fixed RC (%)</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM Capacity Ratio — Adaptive RC (%)</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM Mediana G</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM IQR G</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM dG</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM Mediana Tamb</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM IQR Tamb</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>ASTM dT</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0', cursor: 'help' }} title="Distância estatística normalizada entre a Reporting Condition e o centro da distribuição dos dados utilizados na regressão.">ASTM RC Distance</th>}
                      {results && resultsSim && <th style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0', cursor: 'help' }} title="Indica se a Reporting Condition está fora da faixa dos dados ambientais utilizados na regressão e mede a severidade dessa extrapolação.">ASTM RC Extrapolation Index</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set([
                      ...(results?.daily_results ? Object.keys(results.daily_results) : []),
                      ...(resultsSim?.daily_results ? Object.keys(resultsSim.daily_results) : [])
                    ])).sort().map(date => {
                      const d1 = results?.daily_results?.[date];
                      const d2 = resultsSim?.daily_results?.[date];
                      const pMedido = d1 ? (d1.a1 * rcG + d1.a2 * Math.pow(rcG, 2) + d1.a3 * rcG * rcT) : null;
                      const pSimulado = d2 ? (d2.a1 * rcG + d2.a2 * Math.pow(rcG, 2) + d2.a3 * rcG * rcT) : null;
                      const ratio = pMedido && pSimulado ? (pMedido / pSimulado) * 100 : null;
                      const qs = d1 ? getQualityScore(d1.r2, d1.p_value_max, d1.error_stat) : null;
                      
                      const astmMed = results?.astm_results?.[date];
                      const astmSim = resultsSim?.astm_results?.[date];
                      const astmPMedido = astmMed ? (astmMed.a1 * rcG + astmMed.a2 * Math.pow(rcG, 2) + astmMed.a3 * rcG * rcT) : null;
                      const astmPSimulado = astmSim ? (astmSim.a1 * rcG + astmSim.a2 * Math.pow(rcG, 2) + astmSim.a3 * rcG * rcT) : null;
                      const astmRatio = astmPMedido && astmPSimulado ? (astmPMedido / astmPSimulado) * 100 : null;
                      const astmQs = astmMed ? getQualityScore(astmMed.r2, astmMed.p_value_max, astmMed.error_stat) : null;
                      
                      const dailyRcMetrics = d1 ? calculateRcMetrics(d1.g_median, d1.g_iqr, d1.g_min, d1.g_max, d1.t_median, d1.t_iqr, d1.t_min, d1.t_max, rcG, rcT) : { distance: null, ei: null, dG: null, dT: null };
                      const astmRcMetrics = astmMed ? calculateRcMetrics(astmMed.g_median, astmMed.g_iqr, astmMed.g_min, astmMed.g_max, astmMed.t_median, astmMed.t_iqr, astmMed.t_min, astmMed.t_max, rcG, rcT) : { distance: null, ei: null, dG: null, dT: null };
                      
                      const gP60Daily = d1?.g_p60 != null ? d1.g_p60 : null;
                      const tMeanDaily = d1?.t_mean != null ? d1.t_mean : null;
                      const pMedidoAdaptive = d1 && gP60Daily != null ? (d1.a1 * gP60Daily + d1.a2 * Math.pow(gP60Daily, 2) + d1.a3 * gP60Daily * tMeanDaily) : null;
                      const pSimuladoAdaptive = d2 && gP60Daily != null ? (d2.a1 * gP60Daily + d2.a2 * Math.pow(gP60Daily, 2) + d2.a3 * gP60Daily * tMeanDaily) : null;
                      const ratioAdaptive = pMedidoAdaptive && pSimuladoAdaptive ? (pMedidoAdaptive / pSimuladoAdaptive) * 100 : null;
                      const dailyAdaptiveRcMetrics = d1 && gP60Daily != null ? calculateRcMetrics(d1.g_median, d1.g_iqr, d1.g_min, d1.g_max, d1.t_median, d1.t_iqr, d1.t_min, d1.t_max, gP60Daily, tMeanDaily) : { distance: null, ei: null, dG: null, dT: null };
                      
                      const gP60Astm = astmMed?.g_p60 != null ? astmMed.g_p60 : null;
                      const tMeanAstm = astmMed?.t_mean != null ? astmMed.t_mean : null;
                      const astmPMedidoAdaptive = astmMed && gP60Astm != null ? (astmMed.a1 * gP60Astm + astmMed.a2 * Math.pow(gP60Astm, 2) + astmMed.a3 * gP60Astm * tMeanAstm) : null;
                      const astmPSimuladoAdaptive = astmSim && gP60Astm != null ? (astmSim.a1 * gP60Astm + astmSim.a2 * Math.pow(gP60Astm, 2) + astmSim.a3 * gP60Astm * tMeanAstm) : null;
                      const astmRatioAdaptive = astmPMedidoAdaptive && astmPSimuladoAdaptive ? (astmPMedidoAdaptive / astmPSimuladoAdaptive) * 100 : null;
                      const astmAdaptiveRcMetrics = astmMed && gP60Astm != null ? calculateRcMetrics(astmMed.g_median, astmMed.g_iqr, astmMed.g_min, astmMed.g_max, astmMed.t_median, astmMed.t_iqr, astmMed.t_min, astmMed.t_max, gP60Astm, tMeanAstm) : { distance: null, ei: null, dG: null, dT: null };
                      
                      const formatScore = (s) => s != null ? (isNaN(s) ? '—' : s.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%') : '—';
                      const formatDist = (d) => d != null ? (isNaN(d) ? '—' : d.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '—';

                      
                      return (
                        <React.Fragment key={date}>
                          <tr 
                            onClick={() => d1 && toggleRow(date)} 
                            style={{ borderBottom: '1px solid #e2e8f0', cursor: d1 ? 'pointer' : 'default', transition: 'background 0.2s', background: expandedRow === date ? '#f8fafc' : 'transparent' }}
                            title={d1 ? "Clique para ver o diagnóstico estatístico" : ""}
                          >
                            <td style={{ padding: '10px 16px', color: '#334155', fontWeight: 500 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {d1 && <span style={{ transform: expandedRow === date ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block', fontSize: '10px', color: '#94a3b8' }}>▶</span>}
                                {date}
                              </div>
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'center', color: '#475569' }}>
                              <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, border: '1px solid #e2e8f0' }}>
                                {results?.resolution || '1 min'}
                              </span>
                            </td>
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{pMedido ? pMedido.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d1?.r2 != null ? d1.r2.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—'}</td>}
                            {resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{pSimulado ? pSimulado.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d2?.r2 != null ? d2.r2.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d1?.n_points != null ? d1.n_points.toLocaleString('pt-BR') : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d1?.p_value_max != null ? formatPValue(d1.p_value_max) : '—'}</td>}
                            {results && (
                              <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                {qs ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: qs.color, border: `1px solid ${qs.border}`, padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, color: '#334155' }} title={qs.reason}>
                                    {qs.icon} {qs.text}
                                  </span>
                                ) : '—'}
                              </td>
                            )}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{ratio ? ratio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{ratioAdaptive ? ratioAdaptive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d1?.g_median != null ? d1.g_median.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d1?.g_iqr != null ? d1.g_iqr.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(dailyRcMetrics.dG)}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d1?.t_median != null ? d1.t_median.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{d1?.t_iqr != null ? d1.t_iqr.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(dailyRcMetrics.dT)}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(dailyRcMetrics.distance)}</td>}
                            {results && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(dailyRcMetrics.ei)}</td>}
                            {results && resultsSim && (
                              <td 
                                style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#0f172a', cursor: 'help' }}
                                title={astmMed ? `Dias Válidos na Janela: ${astmMed.window_days.join(', ')}\nPontos Válidos: ${astmMed.n_points.toLocaleString('pt-BR')}\nR² (Medido): ${astmMed.r2.toFixed(4)}\nQuality Score (Medido): ${astmQs?.text}` : "Nenhuma janela começa neste dia ou faltam dias válidos"}
                              >
                                {astmRatio ? astmRatio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}
                              </td>
                            )}
                            {results && resultsSim && (
                              <td 
                                style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}
                              >
                                {astmRatioAdaptive ? astmRatioAdaptive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}
                              </td>
                            )}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{astmMed?.g_median != null ? astmMed.g_median.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{astmMed?.g_iqr != null ? astmMed.g_iqr.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(astmRcMetrics.dG)}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{astmMed?.t_median != null ? astmMed.t_median.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{astmMed?.t_iqr != null ? astmMed.t_iqr.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(astmRcMetrics.dT)}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(astmRcMetrics.distance)}</td>}
                            {results && resultsSim && <td style={{ padding: '10px 16px', textAlign: 'right', color: '#334155' }}>{formatDist(astmRcMetrics.ei)}</td>}
                          </tr>
                          {expandedRow === date && d1 && (
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                              <td colSpan={results && resultsSim ? 26 : 16} style={{ padding: '16px 40px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                                    🔬 Diagnóstico Estatístico
                                  </div>
                                  
                                  <div style={{ fontSize: '13px', color: '#475569', maxWidth: '600px' }}>
                                    <strong>Quality Score</strong> é um indicador interno de diagnóstico. Ele não representa um critério normativo de aprovação/reprovação.
                                  </div>

                                    <div style={{ display: 'flex', gap: '32px', marginTop: '16px' }}>
                                      {/* Existing global metrics and coef table... */}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
                                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Métricas Globais</div>
                                        <div style={{ fontSize: '13px', color: '#334155' }}><strong>R²:</strong> {d1.r2 != null ? d1.r2.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : 'N/A'}</div>
                                        <div style={{ fontSize: '13px', color: '#334155' }}><strong>P-value máximo:</strong> {d1.p_value_max != null ? formatPValue(d1.p_value_max) : 'N/A'}</div>
                                        <div style={{ fontSize: '13px', color: '#334155' }}><strong>Pontos válidos:</strong> {d1.n_points != null ? d1.n_points.toLocaleString('pt-BR') : 'N/A'}</div>
                                        <div style={{ fontSize: '13px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <strong>Quality:</strong> {qs?.icon} {qs?.text}
                                        </div>
                                      </div>
                                      
                                      <div style={{ flex: 1 }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                                          <thead>
                                            <tr style={{ background: '#f1f5f9' }}>
                                              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Coeficiente</th>
                                              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Valor</th>
                                              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Erro Padrão</th>
                                              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>t</th>
                                              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>p-value</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {[
                                              { name: 'a1 (G)', val: d1.a1, se: d1.se?.[0], t: d1.t_stat?.[0], p: d1.p_values?.[0] },
                                              { name: 'a2 (G²)', val: d1.a2, se: d1.se?.[1], t: d1.t_stat?.[1], p: d1.p_values?.[1] },
                                              { name: 'a3 (G*T)', val: d1.a3, se: d1.se?.[2], t: d1.t_stat?.[2], p: d1.p_values?.[2] }
                                            ].map((row, i) => (
                                              <tr key={i} style={{ borderBottom: i < 2 ? '1px solid #e2e8f0' : 'none' }}>
                                                <td style={{ padding: '8px 12px', color: '#334155', fontWeight: 600 }}>{row.name}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontFamily: 'monospace' }}>{row.val != null ? row.val.toExponential(4) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontFamily: 'monospace' }}>{row.se != null ? row.se.toExponential(4) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontFamily: 'monospace' }}>{row.t != null ? row.t.toFixed(4) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', fontFamily: 'monospace' }}>{row.p != null ? formatPValue(row.p) : '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    {/* Comparação Fixed vs Adaptive */}
                                    <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>
                                        ⚖️ Comparação de Reporting Conditions (Daily)
                                      </div>
                                      <div style={{ display: 'flex', gap: '16px' }}>
                                        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '8px' }}>Fixed RC</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>G_RC:</strong> {rcG} W/m²</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>T_RC:</strong> {rcT} °C</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>RC Distance:</strong> {formatDist(dailyRcMetrics.distance)}</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px' }}><strong>RC Extrapolation Index:</strong> {formatDist(dailyRcMetrics.ei)}</div>
                                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{ratio ? ratio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}</div>
                                        </div>
                                        <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px' }}>
                                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '8px' }}>Adaptive RC</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>G_RC (P60):</strong> {gP60Daily != null ? gP60Daily.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'} W/m²</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>T_RC (média):</strong> {tMeanDaily != null ? tMeanDaily.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'} °C</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>RC Distance:</strong> {formatDist(dailyAdaptiveRcMetrics.distance)}</div>
                                          <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px' }}><strong>RC Extrapolation Index:</strong> {formatDist(dailyAdaptiveRcMetrics.ei)}</div>
                                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#1d4ed8' }}>{ratioAdaptive ? ratioAdaptive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}</div>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {astmMed && (
                                      <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>
                                          ⚖️ Comparação de Reporting Conditions (ASTM - Janela de {astmWindow} dias)
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px' }}>
                                          <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '8px' }}>Fixed RC</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>G_RC:</strong> {rcG} W/m²</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>T_RC:</strong> {rcT} °C</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>RC Distance:</strong> {formatDist(astmRcMetrics.distance)}</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px' }}><strong>RC Extrapolation Index:</strong> {formatDist(astmRcMetrics.ei)}</div>
                                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{astmRatio ? astmRatio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}</div>
                                          </div>
                                          <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '8px' }}>Adaptive RC</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>G_RC (P60):</strong> {gP60Astm != null ? gP60Astm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'} W/m²</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>T_RC (média):</strong> {tMeanAstm != null ? tMeanAstm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'} °C</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}><strong>RC Distance:</strong> {formatDist(astmAdaptiveRcMetrics.distance)}</div>
                                            <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px' }}><strong>RC Extrapolation Index:</strong> {formatDist(astmAdaptiveRcMetrics.ei)}</div>
                                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1d4ed8' }}>{astmRatioAdaptive ? astmRatioAdaptive.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'}</div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {(results?.astm_error || resultsSim?.astm_error) && (
                <div style={{ marginTop: '16px', padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '20px' }}>⚠️</div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: '#991b1b', fontSize: '14px', fontWeight: 600 }}>Atenção: ASTM Capacity Ratio não calculado</h4>
                    <p style={{ margin: 0, color: '#7f1d1d', fontSize: '13px' }}>
                      {results?.astm_error || resultsSim?.astm_error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CapacityTestView;
