import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'

export default function DatabaseImportModal({ usina, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  
  const [config, setConfig] = useState({
    host: '',
    port: 5432,
    database: '',
    user: '',
    password: ''
  })
  
  const [queryConfig, setQueryConfig] = useState({
    tables: [{ name: '', offset: 0 }],
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    exception_dates: [],
    skip_unmapped: true
  })
  
  const [tempExceptionDate, setTempExceptionDate] = useState('')
  const [connected, setConnected] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [dbDateRange, setDbDateRange] = useState(null)
  
  const fileInputRef = useRef(null)

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Retorna array de arrays
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        let newDates = [];
        data.forEach(row => {
          if (!row || row.length === 0) return;
          // Procurar por data na primeira coluna ou em qualquer coluna
          for (let cell of row) {
            if (!cell) continue;
            // Se o cellDates: true funcionou, pode ser um objeto Date
            if (cell instanceof Date) {
              if (!isNaN(cell)) {
                newDates.push(cell.toISOString().split('T')[0]);
              }
            } else if (typeof cell === 'string') {
              // Tentar extrair do formato DD/MM/YYYY
              const match = cell.match(/(\d{2})\/(\d{2})\/(\d{4})/);
              if (match) {
                const [_, d, m, y] = match;
                newDates.push(`${y}-${m}-${d}`);
              }
            } else if (typeof cell === 'number') {
               // Pode ser formato de data do excel (serial) sem cellDates
               const date = new Date(Math.round((cell - 25569) * 86400 * 1000));
               if (!isNaN(date)) {
                  newDates.push(date.toISOString().split('T')[0]);
               }
            }
          }
        });
        
        if (newDates.length > 0) {
          setQueryConfig(prev => {
            const merged = Array.from(new Set([...prev.exception_dates, ...newDates])).sort();
            return { ...prev, exception_dates: merged };
          });
        }
      } catch (err) {
        console.error("Erro ao ler excel:", err);
        alert("Erro ao ler arquivo Excel de datas.");
      }
      
      // Reseta o input file
      if (fileInputRef.current) {
         fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  }

  useEffect(() => {
    const saved = localStorage.getItem(`db_import_config_${usina?.nome || usina}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.config) setConfig(prev => ({ ...prev, ...parsed.config, password: '' }))
        if (parsed.queryConfig) {
          let loadedTables = parsed.queryConfig.tables;
          if (typeof loadedTables === 'string') {
             loadedTables = loadedTables.split(',').map(t => ({ name: t.trim(), offset: 0 })).filter(t => t.name)
             if (loadedTables.length === 0) loadedTables = [{ name: '', offset: 0 }]
          }
          let loadedExceptions = parsed.queryConfig.exception_dates || [];
          setQueryConfig(prev => ({ ...prev, ...parsed.queryConfig, tables: loadedTables, exception_dates: loadedExceptions }))
        }
      } catch (e) {}
    }
  }, [usina])

  const saveConfig = () => {
    const { password, ...safeConfig } = config
    localStorage.setItem(`db_import_config_${usina?.nome || usina}`, JSON.stringify({
      config: safeConfig,
      queryConfig
    }))
  }

  const handleConnect = async () => {
    if (!config.host || !config.database || !config.user || !config.password || !queryConfig.tables.some(t => t.name.trim())) {
      setError("Preencha todos os campos obrigatórios (Host, Banco, Usuário, Senha e Tabelas)")
      return
    }
    
    saveConfig()
    
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    
    try {
      const res = await fetch('http://localhost:8000/api/database/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          tables: queryConfig.tables.filter(t => t.name.trim())
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erro ao conectar')
      
      if (data.status === 'warning') {
        setError(data.message)
      } else {
        setSuccessMsg(data.message)
        
        // Se a API retornou o período mínimo e máximo, atualizar os campos automaticamente
        if (data.data?.min_date && data.data?.max_date) {
          setQueryConfig(prev => ({
            ...prev,
            start_date: data.data.min_date,
            end_date: data.data.max_date
          }))
          setDbDateRange({ min: data.data.min_date, max: data.data.max_date })
        }
      }
      setConnected(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExportSeriesNames = async () => {
    const tableList = queryConfig.tables.filter(t => t.name.trim())
    if (tableList.length === 0) {
      setError("Nenhuma tabela definida para extração.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:8000/api/database/export-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          tables: tableList
        })
      })
      
      if (!res.ok) {
         const data = await res.json().catch(() => ({}))
         throw new Error(data.detail || 'Erro ao exportar séries')
      }
      
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'series_banco_dados.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
      
      toast.success("Nomes das séries extraídos com sucesso!")
    } catch (err) {
      console.error("Export error:", err)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!queryConfig.start_date || !queryConfig.end_date) {
      setError("Selecione o período (Data Início e Data Fim)")
      return
    }
    
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    setImportProgress({ status: 'starting', message: 'Iniciando importação...', progress: 0, file_idx: 1, total_files: 1 })
    
    try {
      const reqBody = {
        usina: usina?.nome || usina,
        config,
        tables: queryConfig.tables.filter(t => t.name.trim()),
        start_date: queryConfig.start_date,
        end_date: queryConfig.end_date,
        start_time: queryConfig.start_time || null,
        end_time: queryConfig.end_time || null,
        exception_dates: queryConfig.exception_dates || [],
        skip_unmapped: queryConfig.skip_unmapped
      }
      const res = await fetch('http://localhost:8000/api/database/import-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      })
      
      if (!res.ok) {
         const errData = await res.json().catch(() => ({}))
         throw new Error(errData.detail || `Erro ao importar do banco de dados`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let total_series = 0
      
      while(true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.status === 'error') {
               setImportProgress(null)
               throw new Error(msg.message)
            }
            if (msg.status === 'success') {
              total_series = msg.total_series || 0
            } else {
              setImportProgress(msg)
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e
          }
        }
      }
      
      if (onSuccess) {
        onSuccess({ 
          total_series, 
          msg: `Foram importadas ${total_series} séries do PostgreSQL.`,
          start_date: queryConfig.start_date,
          end_date: queryConfig.end_date
        })
      } else {
        alert(`Importação concluída! ${total_series} séries importadas.`)
        onClose()
      }
    } catch (err) {
      setError(err.message)
      setImportProgress(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20
    }}>
      <div className="card fade-in" style={{ 
        width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>🗄️ Importar do Banco de Dados PostgreSQL</h2>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading} style={{ padding: '4px 8px' }}>✕</button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: 16, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)' }}>
            ✅ {successMsg}
          </div>
        )}

        {/* Formulário de Conexão */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Host / IP</label>
            <input 
              className="input-field" 
              placeholder="ex: 192.168.0.100 ou meuservidor.com" 
              value={config.host} 
              onChange={e => setConfig({...config, host: e.target.value})}
              disabled={loading || connected}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Porta</label>
            <input 
              type="number"
              className="input-field" 
              value={config.port} 
              onChange={e => setConfig({...config, port: parseInt(e.target.value) || 5432})}
              disabled={loading || connected}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Banco de Dados</label>
            <input 
              className="input-field" 
              placeholder="Nome do database" 
              value={config.database} 
              onChange={e => setConfig({...config, database: e.target.value})}
              disabled={loading || connected}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Usuário</label>
            <input 
              className="input-field" 
              placeholder="postgres" 
              value={config.user} 
              onChange={e => setConfig({...config, user: e.target.value})}
              disabled={loading || connected}
            />
          </div>
        </div>
        
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          <label className="form-label" style={{ fontWeight: 600 }}>Senha</label>
          <input 
            type="password"
            className="input-field" 
            placeholder="***" 
            value={config.password} 
            onChange={e => setConfig({...config, password: e.target.value})}
            disabled={loading || connected}
          />
        </div>

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Configuração da Query */}
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          <label className="form-label" style={{ fontWeight: 600 }}>Tabelas para Importar e Defasagem (minutos)</label>
          {queryConfig.tables.map((t, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input 
                className="input-field" 
                style={{ flex: 1 }}
                placeholder='Nome da tabela (ex: "CTG_INV_1")' 
                value={t.name} 
                onChange={e => {
                  const newTables = [...queryConfig.tables]
                  newTables[idx].name = e.target.value
                  setQueryConfig({...queryConfig, tables: newTables})
                }}
                disabled={loading || connected}
              />
              <input 
                type="number"
                className="input-field" 
                style={{ width: '120px' }}
                placeholder="0" 
                value={t.offset} 
                onChange={e => {
                  const newTables = [...queryConfig.tables]
                  newTables[idx].offset = parseInt(e.target.value) || 0
                  setQueryConfig({...queryConfig, tables: newTables})
                }}
                disabled={loading || connected}
              />
              <button 
                type="button"
                style={{ 
                  background: 'none', border: 'none', color: '#ef4444', 
                  cursor: 'pointer', padding: '4px', fontSize: 20, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: (loading || connected) ? 0.5 : 1
                }}
                disabled={loading || connected}
                onClick={() => {
                  const newTables = [...queryConfig.tables]
                  newTables.splice(idx, 1)
                  setQueryConfig({...queryConfig, tables: newTables})
                }}
              >
                &times;
              </button>
            </div>
          ))}
          {!connected && !loading && (
            <button 
              type="button"
              style={{
                alignSelf: 'flex-start', background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600,
                color: 'var(--text-secondary)', cursor: 'pointer', marginTop: 4
              }}
              onClick={() => setQueryConfig({ ...queryConfig, tables: [...queryConfig.tables, { name: '', offset: 0 }] })}
            >
              + Adicionar Tabela
            </button>
          )}
        </div>

        {connected && (
          <div className="fade-in" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: 16, borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, marginTop: 0, marginBottom: 12 }}>Filtro de Período</h3>
            
            {dbDateRange ? (
              <p style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✅</span> O banco de dados possui dados de <strong>{dbDateRange.min.split('-').reverse().join('/')}</strong> até <strong>{dbDateRange.max.split('-').reverse().join('/')}</strong>. O período já foi preenchido automaticamente!
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                O sistema baixará os dados entre essas datas e as mesclará no banco de dados local. A coluna de tempo (timestamp, data_hora, etc) é detectada automaticamente.
              </p>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Data Início</label>
                <input 
                  type="date"
                  className="input-field" 
                  value={queryConfig.start_date} 
                  onChange={e => setQueryConfig({...queryConfig, start_date: e.target.value})}
                  disabled={loading}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Data Fim</label>
                <input 
                  type="date"
                  className="input-field" 
                  value={queryConfig.end_date} 
                  onChange={e => setQueryConfig({...queryConfig, end_date: e.target.value})}
                  disabled={loading}
                />
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Hora Início (Opcional)</label>
                <input 
                  type="time"
                  className="input-field" 
                  value={queryConfig.start_time || ''} 
                  onChange={e => setQueryConfig({...queryConfig, start_time: e.target.value})}
                  disabled={loading}
                  title="Deixe em branco para importar o dia inteiro"
                />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Hora Fim (Opcional)</label>
                <input 
                  type="time"
                  className="input-field" 
                  value={queryConfig.end_time || ''} 
                  onChange={e => setQueryConfig({...queryConfig, end_time: e.target.value})}
                  disabled={loading}
                  title="Deixe em branco para importar o dia inteiro"
                />
              </div>
            </div>
            
            {/* Exceções de Datas */}
            <div style={{ marginTop: 16 }}>
              <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Dias a Ignorar (Exceções)</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input 
                  type="date"
                  className="input-field" 
                  style={{ maxWidth: 200 }}
                  value={tempExceptionDate} 
                  onChange={e => setTempExceptionDate(e.target.value)}
                  disabled={loading}
                />
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    if (tempExceptionDate && !queryConfig.exception_dates.includes(tempExceptionDate)) {
                      setQueryConfig(prev => ({
                        ...prev,
                        exception_dates: [...prev.exception_dates, tempExceptionDate].sort()
                      }));
                      setTempExceptionDate('');
                    }
                  }}
                  disabled={!tempExceptionDate || loading}
                  style={{ padding: '6px 12px', fontSize: 13 }}
                >
                  Adicionar
                </button>
                <input 
                  type="file" 
                  accept=".xlsx, .xls"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleExcelUpload}
                />
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 13, background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px dashed var(--border-color)' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  title="Importar um arquivo Excel contendo as datas a serem ignoradas"
                >
                  Importar Excel
                </button>
              </div>
              
              {queryConfig.exception_dates && queryConfig.exception_dates.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {queryConfig.exception_dates.map(date => (
                    <div 
                      key={date} 
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: 6, 
                        background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', 
                        padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500,
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                      }}
                    >
                      {date.split('-').reverse().join('/')}
                      <button 
                        onClick={() => {
                          setQueryConfig(prev => ({
                            ...prev,
                            exception_dates: prev.exception_dates.filter(d => d !== date)
                          }))
                        }}
                        disabled={loading}
                        style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: loading ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}
                        onMouseOver={e => e.currentTarget.style.opacity = 1}
                        onMouseOut={e => e.currentTarget.style.opacity = 0.7}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input 
                  type="checkbox" 
                  checked={queryConfig.skip_unmapped}
                  onChange={(e) => setQueryConfig({ ...queryConfig, skip_unmapped: e.target.checked })}
                  style={{ cursor: 'pointer', width: 16, height: 16 }}
                  disabled={loading}
                />
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Importar somente as séries que estiverem mapeadas no Excel (ignorar restantes)</span>
              </label>
            </div>
          </div>
        )}

        {/* Progresso de Importação */}
        {importProgress && (
          <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-input)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              <span style={{ color: importProgress.status === 'warning' ? 'var(--orange)' : 'inherit' }}>
                {importProgress.message}
              </span>
              <span>{importProgress.file_idx} / {importProgress.total_files}</span>
            </div>
            
            {importProgress.status !== 'warning' && (
              <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${importProgress.progress || 0}%`, 
                  background: 'var(--gradient-solar)', 
                  borderRadius: 3, 
                  transition: 'width 0.3s ease-out' 
                }} />
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 'auto' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          
          {!connected ? (
            <button 
              className="btn btn-primary" 
              onClick={handleConnect} 
              disabled={loading}
            >
              {loading ? 'Testando Conexão...' : 'Conectar e Verificar Tabelas'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn btn-ghost" 
                onClick={handleExportSeriesNames} 
                disabled={loading}
                style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {loading ? '⏳' : '📥'} Extrair Nomes de Séries
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleImport} 
                disabled={loading}
              >
                {loading ? 'Importando...' : 'Iniciar Importação'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
