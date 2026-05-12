# ☀️ Usina Solar — Plataforma de Análise de Dados

Aplicação full-stack para análise operacional de usinas solares fotovoltaicas.

---

## 📁 Estrutura do Projeto

```
Causa Raiz/
├── backend/              ← FastAPI (Python)
│   ├── main.py
│   ├── requirements.txt
│   ├── routes/
│   │   ├── upload.py     ← POST /upload
│   │   ├── series.py     ← GET /series, /dates, /map-series/*
│   │   └── data.py       ← GET /data
│   ├── services/
│   │   ├── excel_service.py    ← Leitura Excel → Parquet
│   │   ├── parquet_service.py  ← Consultas eficientes
│   │   └── mapping_service.py  ← Sistema Mapeamento de Séries ⭐
│   ├── models/
│   │   └── schemas.py
│   ├── utils/
│   │   ├── config.py
│   │   └── logger.py
│   └── data/             ← Arquivos Parquet salvos aqui
│
├── frontend/             ← React + Vite
│   └── src/
│       ├── pages/
│       │   ├── UploadPage.jsx
│       │   ├── MappingPage.jsx   ← Sistema Mapeamento de Séries ⭐
│       │   └── DashboardPage.jsx
│       ├── components/
│       │   ├── SeriesSelector.jsx
│       │   ├── TimeRangeFilter.jsx
│       │   ├── TimeSeriesChart.jsx  ← Plotly
│       │   ├── DataTable.jsx        ← TanStack Table
│       │   ├── Heatmap.jsx          ← Plotly Heatmap
│       │   ├── SeriesMapImport.jsx
│       │   └── StateComponents.jsx
│       ├── hooks/
│       │   ├── useSeries.js
│       │   └── useSeriesData.js
│       └── services/
│           └── api.js
```

---

## 🚀 Como Rodar

### Pré-requisitos

| Ferramenta | Versão mínima | Link |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.10+ | https://python.org/downloads |

> **Python não está instalado no seu sistema.** Baixe em https://python.org/downloads e marque ✅ **"Add Python to PATH"** durante a instalação.

---

### Backend (FastAPI)

```powershell
# Terminal 1 — Backend
cd "e:\Antigravity\Causa Raiz\backend"

# Criar ambiente virtual (apenas primeira vez)
python -m venv venv

# Ativar ambiente virtual (necessário sempre que for rodar ou instalar)
# No Windows PowerShell:
.\venv\Scripts\Activate.ps1
# (No Mac/Linux seria: source venv/bin/activate)

# Instalar dependências (primeira vez)
pip install -r requirements.txt

# Rodar o servidor
uvicorn main:app --reload --port 8000
```

✅ API disponível em: **http://localhost:8000**  
📚 Swagger UI: **http://localhost:8000/docs**

---

### Frontend (React + Vite)

```powershell
# Terminal 2 — Frontend
cd "e:\Antigravity\Causa Raiz\frontend"

# Rodar (dependências já instaladas)
npm run dev
```

✅ App disponível em: **http://localhost:5173**

---

## 🗺️ Fluxo de uso recomendado

```
1. Upload        →  Envie o Excel diário da usina
2. Mapeamento de Séries  →  Baixe o template, preencha e importe
3. Dashboard     →  Selecione séries e visualize
```

### 1. Upload de dados
- Acesse **Upload** na navbar
- Arraste o `.xlsx` do dia (ou clique para selecionar)
- O sistema converte para Parquet e detecta data automaticamente
- Arquivos idênticos são cacheados por MD5 (não são reprocessados)

### 2. Mapeamento de Séries ⭐
- Acesse **Mapeamento de Séries** na navbar
- Selecione a data de referência
- Clique **Template** para baixar o Excel pré-preenchido com as colunas
- Preencha: `coluna_excel | elemento | skid | inversor | stringbox`
- Importe de volta — as séries ficam classificadas

**Elementos disponíveis:**
Tracker, Corrente CA, Corrente CC Total, Corrente CC String, Potência CC String, Irradiação, Potência CA Inv, Potência CA PPC, Sujidade, Temperatura Módulo, Tensão CA Inv, Tensão CC Inv, Tensão CC Stringbox, Velocidade do Vento

### 3. Dashboard
- Selecione a **data** no painel esquerdo
- Use os **filtros em cascata**: Elemento → SKID → Inversor
- Selecione até **20 séries** simultâneas
- Defina **intervalo de tempo** (padrão: dia completo)
- Clique **Visualizar** e alterne entre:
  - 📈 **Gráfico** — linhas temporais com Plotly
  - 📋 **Tabela** — dados com células coloridas por valor
  - 🌡️ **Heatmap** — mapa de calor séries × tempo

---

## 🔌 Endpoints da API

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/upload` | Upload de Excel → converte para Parquet |
| `GET` | `/dates` | Lista datas com dados disponíveis |
| `GET` | `/series?date=YYYY-MM-DD` | Lista séries da data com metadados de Mapeamento de Séries |
| `GET` | `/elementos` | Lista tipos de Elemento |
| `GET` | `/data` | Retorna dados filtrados (colunar) |
| `POST` | `/map-series/import` | Importa Excel de Mapeamento de Séries |
| `GET` | `/map-series/validate?date=` | Valida mapeamento contra Parquet |
| `GET` | `/map-series/template?date=` | Baixa template Excel |

---

## ⚡ Decisões de Performance

| Situação | Solução |
|---|---|
| Excel com 10k colunas | Leitura completa → Parquet (write uma vez) |
| Consultas frequentes | `read_parquet(columns=[...])` — só lê colunas solicitadas |
| Re-upload do mesmo file | Cache MD5 — detecção instantânea |
| 20 séries × 1440 pts | 28.800 pontos — sem downsampling necessário |
| Filtros no frontend | Locais (sem re-fetch) após carregar a lista de séries |

---

## 📦 Tecnologias

**Backend:** Python · FastAPI · Pandas · PyArrow · OpenPyXL  
**Frontend:** React · Vite · Plotly.js · TanStack Table · Axios · React Router
