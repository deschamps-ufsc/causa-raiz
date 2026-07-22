/**
 * Camada de comunicação com o backend FastAPI.
 * Todas as chamadas à API passam por aqui.
 */
import axios from 'axios'

const TOKEN_KEY = 'cr_auth_token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 120000, // 2 min (Excel grandes podem demorar)
})

// ── Interceptor de request — injeta token ─────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Interceptor de erros globais ──────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expirado ou inválido — limpa storage e redireciona
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('cr_auth_user')
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    const msg = err.response?.data?.detail || err.message || 'Erro desconhecido'
    return Promise.reject(new Error(msg))
  }
)

// ── Auth endpoints ────────────────────────────────────────────
export const apiLogin = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data)

export const fetchAuthUsers = () =>
  api.get('/auth/users').then(r => r.data)

export const createAuthUser = (data) =>
  api.post('/auth/users', data).then(r => r.data)

export const updateAuthUser = (email, data) =>
  api.patch(`/auth/users/${encodeURIComponent(email)}`, data).then(r => r.data)

export const deleteAuthUser = (email) =>
  api.delete(`/auth/users/${encodeURIComponent(email)}`).then(r => r.data)

// ── Settings ──────────────────────────────────────────────────
export const fetchElementSettings = () =>
  api.get('/settings/elements').then(r => r.data)

export const saveElementSettings = (settings) =>
  api.put('/settings/elements', settings).then(r => r.data)

export const fetchFilterSettings = () =>
  api.get('/settings/filters').then(r => r.data)

export const saveFilterSettings = (settings) =>
  api.put('/settings/filters', settings).then(r => r.data)

// ── Usinas ────────────────────────────────────────────────────
export const fetchUsinas = () =>
  api.get('/usinas').then((r) => r.data)

export const fetchDetailedUsinas = () =>
  api.get('/usinas/detailed').then((r) => r.data)

export const createUsina = (nome) =>
  api.post('/usinas', { nome }).then((r) => r.data)

export const renameUsina = (nome, novoNome) =>
  api.patch(`/usinas/${encodeURIComponent(nome)}`, { novo_nome: novoNome }).then(r => r.data)

export const updateUsinaDriveLink = (nome, driveLink) =>
  api.patch(`/usinas/${encodeURIComponent(nome)}/drive-link`, { drive_link: driveLink }).then(r => r.data)

export const deleteUsina = (nome) =>
  api.delete(`/usinas/${encodeURIComponent(nome)}`).then(r => r.data)

// ── Infos Usina (SKID/INV/MWp) ────────────────────────────────────────
export const fetchUsinaInfo = (usina) =>
  api.get('/usina-info', { params: { usina } }).then((r) => r.data)

export const importUsinaInfo = (usina, file) => {
  const form = new FormData()
  form.append('usina', usina)
  form.append('file', file)
  return api.post('/usina-info/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const getUsinaInfoTemplateUrl = () => {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  return `${base}/usina-info/template`
}

// ── Heatmap de Yield ────────────────────────────────────────────
export const fetchPivotHeatmap = (usina, dates, elemento, filters = []) =>
  api.get('/heatmap/pivot', { params: { usina, dates, elemento, filters: filters?.join(',') || undefined } }).then((r) => r.data)

export const fetchYieldHeatmap = (usina, dates, elemento, filters = [], rowCat = 'skid', colCat = 'inversor') =>
  api.get('/heatmap/yield', { params: { usina, dates, elemento: elemento || undefined, filters: filters?.join(',') || undefined, row_cat: rowCat, col_cat: colCat } }).then((r) => r.data)

export const fetchMapaHeatmap = (usina, dates, filters = []) =>
  api.get('/heatmap/mapa', { params: { usina, dates, filters: filters?.join(',') || undefined } }).then((r) => r.data)

export const fetchTrackerAnalysis = (usina, dates, filters = []) =>
  api.get('/heatmap/trackers', { params: { usina, dates, filters: filters?.join(',') || undefined } }).then((r) => r.data)

export const fetchMapaTimes = (usina, date) =>
  api.get('/heatmap/times', { params: { usina, date } }).then((r) => r.data)

export const fetchMapaInstant = (usina, date, time, filters = []) =>
  api.get('/heatmap/mapa/instant', { params: { usina, date, time, filters: filters?.join(',') || undefined } }).then((r) => r.data)

export const fetchTrackersInstant = (usina, date, time, filters = []) =>
  api.get('/heatmap/trackers/instant', { params: { usina, date, time, filters: filters?.join(',') || undefined } }).then((r) => r.data)


// ── Upload de Excel diário ────────────────────────────────────
export const uploadExcel = (usina, file, onProgress, skipUnmapped = false) => {
  const form = new FormData()
  form.append('usina', usina)
  form.append('file', file)
  if (skipUnmapped) form.append('skip_unmapped', 'true')
  return api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    },
  }).then((r) => r.data)
}

// ── Upload do Excel de Mapa de Strings ────────────────────────
export const uploadMapa = (usina, file, onProgress) => {
  const form = new FormData()
  form.append('usina', usina)
  form.append('file', file)
  return api.post('/upload/mapa', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    },
  }).then((r) => r.data)
}

export const fetchMapaLayout = (usina) =>
  api.get('/upload/mapa', { params: { usina } }).then((r) => r.data)

// ── Datas disponíveis ─────────────────────────────────────────────────────────
export const fetchDates = (usina) =>
  api.get('/dates', { params: { usina } }).then(r => r.data)

export const fetchDatesSummary = (usina) =>
  api.get('/dates/summary', { params: { usina } }).then(r => r.data)

export const fetchDateDetails = (usina, date) =>
  api.get(`/dates/${encodeURIComponent(date)}/details`, { params: { usina } }).then(r => r.data)


// ── Listar séries de uma data ─────────────────────────────────
export const fetchSeries = (usina, dates) =>
  api.get('/series', { params: { usina, dates } }).then((r) => r.data)

export const deleteSeries = (usina, series, dates) =>
  api.delete('/series', { data: { usina, series, dates } }).then((r) => r.data)

// ── Elementos válidos ─────────────────────────────────────────
export const fetchElementos = (usina) =>
  api.get('/elementos', { params: usina ? { usina } : {} }).then((r) => r.data)

// ── Consultar dados ───────────────────────────────────────────
export const fetchData = ({ usina, dates, series, elemento, skid, start, end }) =>
  api.get('/data', {
    params: {
      usina,
      dates,
      series: series?.join(','),
      elemento: elemento || undefined,
      skid: skid || undefined,
      start: start || undefined,
      end: end || undefined,
    },
  }).then((r) => r.data)

// ── Importar Excel Mapeamento de Séries ────────────────────────────────────
export const importMappingExcel = (usina, file) => {
  const form = new FormData()
  form.append('usina', usina)
  form.append('file', file)
  return api.post('/map-series/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const fetchMappingSummary = (usina) =>
  api.get('/map-series/summary', { params: { usina } }).then((r) => r.data)

// ── Obter dados brutos do mapeamento ──────────────────────────
export const fetchMappingData = (usina) =>
  api.get('/map-series/data', { params: { usina } }).then((r) => r.data)

// ── Validar mapeamento ────────────────────────────────────────
export const validateMapping = (usina, date) =>
  api.get('/map-series/validate', { params: { usina, date } }).then((r) => r.data)

// ── URL do template Mapeamento de Séries ───────────────────────────────────
export const getMappingTemplateUrl = (usina, date) => {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  const params = new URLSearchParams()
  if (usina) params.append('usina', usina)
  if (date) params.append('date', date)
  return `${base}/map-series/template?${params.toString()}`
}

// ── Séries Sintéticas (modelo por grupo/batch) ────────────────
export const fetchSynthetics = (usina) =>
  api.get('/synthetic', { params: { usina } }).then((r) => r.data)

export const importSyntheticExcel = (usina, file, nomeGrupo = '') => {
  const form = new FormData()
  form.append('usina', usina)
  form.append('nome_grupo', nomeGrupo)
  form.append('file', file)
  return api.post('/synthetic/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const saveBatchConfig = (usina, batchId, formula, nome) =>
  api.put(`/synthetic/${encodeURIComponent(batchId)}`, { formula, nome }, {
    params: { usina },
  }).then((r) => r.data)

export const deleteBatch = (usina, batchId) =>
  api.delete(`/synthetic/${encodeURIComponent(batchId)}`, {
    params: { usina },
  }).then((r) => r.data)

// ── Visualizações (Save/Load) ─────────────────────────────────
export const fetchVisualizations = (usina) =>
  api.get(`/visualizacoes/${encodeURIComponent(usina)}`).then((r) => r.data)

export const createVisualization = (usina, data) =>
  api.post(`/visualizacoes/${encodeURIComponent(usina)}`, data).then((r) => r.data)

export const updateVisualization = (usina, visId, data) =>
  api.put(`/visualizacoes/${encodeURIComponent(usina)}/${encodeURIComponent(visId)}`, data).then((r) => r.data)

export const deleteVisualization = (usina, visId) =>
  api.delete(`/visualizacoes/${encodeURIComponent(usina)}/${encodeURIComponent(visId)}`).then((r) => r.data)

// ── Fluxograma (Save/Load) ────────────────────────────────────
export const fetchFlowConfig = (usina) =>
  api.get(`/flow/${encodeURIComponent(usina)}`).then((r) => r.data)

export const saveFlowConfig = (usina, config) =>
  api.post(`/flow/${encodeURIComponent(usina)}`, config).then((r) => r.data)

export const runFlow = (usina, dates) =>
  api.post(`/flow/${encodeURIComponent(usina)}/run${dates ? `?dates=${dates}` : ''}`).then((r) => r.data)

export const fetchFlowIntegrals = (usina) =>
  api.get(`/flow/${encodeURIComponent(usina)}/integrals`).then((r) => r.data)

// ============================================================================
// ── CAMPANHAS (PERFORMANCE CAMPAIGNS)
// ============================================================================
export const fetchCampanhas = (usina) =>
  api.get('/campanhas', { params: { usina } }).then((r) => r.data)

export const saveCampanha = (usina, payload) =>
  api.post('/campanhas', payload, { params: { usina } }).then((r) => r.data)

export const deleteCampanha = (usina, nome) =>
  api.delete('/campanhas', { params: { usina, nome } }).then((r) => r.data)

export default api
