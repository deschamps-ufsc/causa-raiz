import React, { useState, useEffect } from 'react';
import * as echarts from 'echarts';

const AnaliseIncertezasView = ({ usinaAtual, selectedDates }) => {
  const [uncertainties, setUncertainties] = useState(() => {
    const saved = localStorage.getItem('pvlib_uncertainties');
    if (saved) {
      try {
        return {
          gpoa: 1.0,
          grear: 1.0,
          tmod: 2.0,
          sujidade: 2.0,
          modeloSimulacao: 2.0,
          energiaMedida: 0.5,
          ...JSON.parse(saved)
        };
      } catch (e) {
        console.error("Failed to parse saved uncertainties", e);
      }
    }
    return {
      gpoa: 1.0,
      grear: 1.0,
      tmod: 2.0,
      sujidade: 2.0,
      modeloSimulacao: 2.0,
      energiaMedida: 0.5
    };
  });

  useEffect(() => {
    localStorage.setItem('pvlib_uncertainties', JSON.stringify(uncertainties));
  }, [uncertainties]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  const handleSimulate = async () => {
    if (!usinaAtual || !selectedDates || selectedDates.length === 0) {
      setError("Selecione uma usina e datas.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      // 1. Get flow config to extract nodes
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const configRes = await fetch(`${baseUrl}/flow/${encodeURIComponent(usinaAtual)}`);
      const flowConfig = await configRes.json();
      
      let nodes = [];
      if (flowConfig && flowConfig.nodeConfigs) {
         nodes = Object.entries(flowConfig.nodeConfigs).map(([id, data]) => ({
           id,
           type: data.type || id,
           data: data
         }));
      }

      // 2. Post to incertezas endpoint
      const { energiaMedida, modeloSimulacao, ...backendUncertainties } = uncertainties;
      const payload = {
        usina: usinaAtual,
        dates: selectedDates,
        uncertainties: backendUncertainties,
        nodes
      };

      const res = await fetch(`${baseUrl}/incertezas/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Erro na simulação");
      }

      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (results && results.nominal) {
      const chartDom = document.getElementById('tornado-chart');
      if (!chartDom) return;
      const myChart = echarts.init(chartDom);
      
      const nom = results.nominal.valor;
      
      const vars = [
        { key: 'gpoa', label: 'Gpoa' },
        { key: 'grear', label: 'Grear' },
        { key: 'tmod', label: 'Tmod' },
        { key: 'sujidade', label: 'Sujidade' }
      ];
      
      const categories = [];
      const dataMin = [];
      const dataMax = [];

      vars.forEach(v => {
        categories.push(v.label);
        const minVal = results[`${v.key}_min`]?.valor || nom;
        const maxVal = results[`${v.key}_max`]?.valor || nom;
        
        // Desvio percentual em relação ao nominal
        const pctMin = ((minVal - nom) / nom) * 100;
        const pctMax = ((maxVal - nom) / nom) * 100;

        // Se a variável inverte o sinal (ex: Tmod maior diminui energia), precisamos ajustar a exibição.
        // O Echarts coloca negativos à esquerda e positivos à direita. 
        // Para a label ficar do lado de fora:
        dataMin.push({
           value: pctMin,
           label: { position: pctMin >= 0 ? 'right' : 'left' }
        });
        dataMax.push({
           value: pctMax,
           label: { position: pctMax >= 0 ? 'right' : 'left' }
        });
      });

      const option = {
        title: {
          text: 'Incerteza Propagada (%)',
          left: 'center',
          textStyle: { fontSize: 14 }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            let s = `<b>${params[0].axisValue}</b><br/>`;
            params.forEach(p => {
               s += `${p.marker} ${p.seriesName}: ${p.value.toFixed(2)}%<br/>`;
            });
            return s;
          }
        },
        legend: {
          bottom: 10,
          data: ['Cenário Máximo', 'Cenário Mínimo']
        },
        grid: {
          left: '1%',
          right: '4%',
          bottom: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'value',
          axisLabel: { formatter: '{value}%' },
          splitLine: { show: true, lineStyle: { type: 'dashed' } },
          min: (value) => {
             const maxAbs = Math.max(Math.abs(value.min), Math.abs(value.max));
             return -(maxAbs + 1.5).toFixed(2);
          },
          max: (value) => {
             const maxAbs = Math.max(Math.abs(value.min), Math.abs(value.max));
             return (maxAbs + 1.5).toFixed(2);
          }
        },
        yAxis: {
          type: 'category',
          data: categories,
          axisTick: { show: false },
          axisLabel: { margin: 45 },
          inverse: true
        },
        series: [
          {
            name: 'Cenário Máximo',
            type: 'bar',
            stack: 'Total',
            itemStyle: { color: '#ef4444' }, // Red
            label: { show: true, formatter: (p) => p.value.toFixed(2) + '%' },
            data: dataMax
          },
          {
            name: 'Cenário Mínimo',
            type: 'bar',
            stack: 'Total',
            itemStyle: { color: '#3b82f6' }, // Blue
            label: { show: true, formatter: (p) => p.value.toFixed(2) + '%' },
            data: dataMin
          }
        ]
      };
      
      myChart.setOption(option);
      
      return () => {
        myChart.dispose();
      };
    }
  }, [results]);

  // Cálculo da Soma Quadrática (Incerteza Combinada)
  let rss_pos_kwh = null;
  let rss_neg_kwh = null;
  let rss_pos_pct = null;
  let rss_neg_pct = null;

  if (results && results.nominal) {
    let sum_pos = 0;
    let sum_neg = 0;
    const nom = results.nominal.valor;
    
    ['gpoa', 'grear', 'tmod', 'sujidade'].forEach(v => {
      const minRes = results[`${v}_min`]?.valor;
      const maxRes = results[`${v}_max`]?.valor;
      if (minRes && maxRes) {
        const d1 = minRes - nom;
        const d2 = maxRes - nom;
        const maxD = Math.max(0, d1, d2);
        const minD = Math.min(0, d1, d2);
        sum_pos += maxD * maxD;
        sum_neg += minD * minD;
      }
    });
    
    rss_pos_kwh = Math.sqrt(sum_pos);
    rss_neg_kwh = -Math.sqrt(sum_neg);
    rss_pos_pct = (rss_pos_kwh / nom) * 100;
    rss_neg_pct = (rss_neg_kwh / nom) * 100;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: '#fff', padding: '20px', borderRadius: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Análise de Propagação de Incertezas (PVLib)</h2>
        <button 
          onClick={() => setShowInfoModal(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
          title="Por que as propagações não são perfeitamente simétricas?"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
        </button>
      </div>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
          Defina as incertezas de medição para cada variável. O sistema calculará o impacto de cada uma individualmente na geração total da usina no período.
        </p>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {Object.keys(uncertainties).map(key => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', width: '150px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '4px', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
              {key === 'tmod' ? 'Tmod (°C)' : key === 'energiaMedida' ? 'Energia Medida (%)' : key === 'sujidade' ? 'Sujidade (%) - Abs.' : key === 'modeloSimulacao' ? 'Modelo de Simulação (%)' : key + ' (%)'}
            </label>
            <input 
              type="number"
              step="0.01"
              value={Number(uncertainties[key]).toFixed(2)}
              onChange={e => setUncertainties(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
              style={{
                padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                fontSize: '14px', outline: 'none'
              }}
            />
          </div>
        ))}
        
        <button 
          onClick={handleSimulate}
          disabled={loading}
          style={{
            padding: '8px 16px', height: '36px', background: loading ? '#94a3b8' : '#3b82f6',
            color: '#fff', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          {loading ? 'Simulando...' : '▶ Calcular Incertezas'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 16px', borderRadius: '6px', fontSize: '14px', border: '1px solid #fca5a5' }}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      {results && results.nominal && (
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {/* Tabela de Resultados */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'auto', flex: '0 0 auto' }}>
            <table style={{ borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Cenário</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Energia (kWh)</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Desvio (kWh)</th>
                  <th style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>Incerteza Propagada</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>Nominal</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>{results.nominal.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>-</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0' }}>-</td>
                </tr>
                {['gpoa', 'grear', 'tmod', 'sujidade'].map(v => {
                  const minRes = results[`${v}_min`]?.valor;
                  const maxRes = results[`${v}_max`]?.valor;
                  if (!minRes || !maxRes) return null;
                  
                  const minDesv = minRes - results.nominal.valor;
                  const maxDesv = maxRes - results.nominal.valor;
                  const minPct = (minDesv / results.nominal.valor) * 100;
                  const maxPct = (maxDesv / results.nominal.valor) * 100;
                  
                  const unit = v === 'tmod' ? '°C' : '%';

                  return (
                    <React.Fragment key={v}>
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>{v} (-{Number(uncertainties[v]).toFixed(2)}{unit})</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>{minRes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: minDesv > 0 ? '#15803d' : '#b91c1c' }}>{minDesv > 0 ? '+' : ''}{minDesv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: minPct > 0 ? '#15803d' : '#b91c1c' }}>{minPct > 0 ? '+' : ''}{minPct.toFixed(2)}%</td>
                      </tr>
                      <tr style={{ background: '#f0fdf4' }}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>{v} (+{Number(uncertainties[v]).toFixed(2)}{unit})</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>{maxRes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: maxDesv > 0 ? '#15803d' : '#b91c1c' }}>{maxDesv > 0 ? '+' : ''}{maxDesv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: maxPct > 0 ? '#15803d' : '#b91c1c' }}>{maxPct > 0 ? '+' : ''}{maxPct.toFixed(2)}%</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                {/* Linha Denominadora (Incerteza Combinada) */}
                {rss_neg_kwh !== null && (
                  <React.Fragment>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td style={{ padding: '10px', borderTop: '2px solid #cbd5e1', fontWeight: 600 }} colSpan="3">Incerteza Dados Ambientais (Negativa)</td>
                      <td style={{ padding: '10px', borderTop: '2px solid #cbd5e1', fontWeight: 600, color: '#b91c1c' }}>{rss_neg_pct.toFixed(2)}%</td>
                    </tr>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }} colSpan="3">Incerteza Dados Ambientais (Positiva)</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#15803d' }}>+{rss_pos_pct.toFixed(2)}%</td>
                    </tr>
                    
                    {/* Linha Modelo de Simulação */}
                    <tr style={{ background: '#f1f5f9' }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }} colSpan="3">Incerteza Modelo de Simulação</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>±{Number(uncertainties.modeloSimulacao).toFixed(2)}%</td>
                    </tr>
                    
                    {/* Linha Energia Medida */}
                    <tr style={{ background: '#f1f5f9' }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }} colSpan="3">Incerteza Energia Medida</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>±{Number(uncertainties.energiaMedida).toFixed(2)}%</td>
                    </tr>
                    
                    {/* Linhas Incerteza EPI */}
                    <tr style={{ background: '#e2e8f0' }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #cbd5e1', fontWeight: 700 }} colSpan="3">Incerteza EPI (Negativa)</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #cbd5e1', fontWeight: 700, color: '#b91c1c' }}>
                        -{Math.sqrt(Math.pow(rss_neg_pct, 2) + Math.pow(Number(uncertainties.modeloSimulacao), 2) + Math.pow(Number(uncertainties.energiaMedida), 2)).toFixed(2)}%
                      </td>
                    </tr>
                    <tr style={{ background: '#e2e8f0' }}>
                      <td style={{ padding: '10px', borderBottom: '1px solid #cbd5e1', fontWeight: 700 }} colSpan="3">Incerteza EPI (Positiva)</td>
                      <td style={{ padding: '10px', borderBottom: '1px solid #cbd5e1', fontWeight: 700, color: '#15803d' }}>
                        +{Math.sqrt(Math.pow(rss_pos_pct, 2) + Math.pow(Number(uncertainties.modeloSimulacao), 2) + Math.pow(Number(uncertainties.energiaMedida), 2)).toFixed(2)}%
                      </td>
                    </tr>
                  </React.Fragment>
                )}
              </tbody>
            </table>
          </div>

          {/* Gráfico Tornado */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff', flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
            <div id="tornado-chart" style={{ width: '500px', flex: 1, minHeight: '350px' }}></div>
          </div>
        </div>
      )}

      {/* Modal de Informação */}
      {showInfoModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '600px', width: '100%',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Por que as propagações não são simétricas?</h3>
              <button onClick={() => setShowInfoModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            
            <div style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6', maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
              <p style={{ marginTop: 0 }}>Você deve ter notado que variações idênticas para cima e para baixo (ex: <strong>+2% e -2%</strong>) não geram deltas de energia perfeitamente espelhados. Isso não é um erro, mas sim o comportamento real da física termodinâmica simulada pelo <strong>PVLib</strong>:</p>
              
              <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <li><strong>Curva de Eficiência do Inversor (Não-linear):</strong> A eficiência do inversor não é constante. Se a potência de entrada sobe 1%, ele pode operar numa faixa térmica ligeiramente menos eficiente do que se a potência caísse 1%.</li>
                <li><strong>O Modelo de Diodo (Exponencial):</strong> A relação entre Tensão, Corrente e Temperatura nos painéis segue equações exponenciais. Uma variação na temperatura altera a curva I-V do painel exponencialmente, fazendo com que descer 2 graus gere um salto de potência diferente do que subir 2 graus.</li>
                <li><strong>Limiares de Partida (Clipping na Base):</strong> Durante o amanhecer ou anoitecer (baixa irradiância), diminuir a irradiação pode derrubar o inversor para baixo do limite mínimo de tensão para ligar, zerando a geração daquele minuto. Já o aumento da irradiância nesses mesmos minutos apenas adiciona um pouco a mais, criando assimetria no balanço diário.</li>
              </ol>
              
              <p style={{ marginBottom: 0 }}>O motor de incertezas não multiplica resultados finais. Ele <strong>re-simula minuto a minuto</strong> todo o circuito elétrico e térmico da usina para cada cenário extremo, capturando essas realidades não-lineares da física.</p>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <button 
                onClick={() => setShowInfoModal(false)}
                style={{ padding: '8px 16px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnaliseIncertezasView;
