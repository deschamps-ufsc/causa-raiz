"""
main.py — Ponto de entrada da API FastAPI.
Usina Solar — Sistema de Análise de Dados Operacionais
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.upload import router as upload_router
from routes.series import router as series_router
from routes.data import router as data_router
from routes.usinas import router as usinas_router
from routes.usina_info import router as usina_info_router
from routes.heatmap import router as heatmap_router
from routes.synthetic import router as synthetic_router
from routes.auth import router as auth_router
from routes.settings import router as settings_router
from routes.visualizacoes import router as visualizacoes_router
from services.auth_service import seed_default_admin
from utils.logger import logger
from utils.config import DATA_DIR

import os

# ── Inicializar aplicação ─────────────────────────────────────────────────────

app = FastAPI(
    title="Usina Solar — API de Análise",
    description=(
        "API para análise de dados operacionais de usina solar fotovoltaica. "
        "Processa arquivos Excel diários com até 10.000 séries temporais, "
        "armazena em formato Parquet e fornece endpoints de consulta eficientes."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS — permite requests do frontend Vite ──────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://causa-raiz.vercel.app",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Registrar routers ─────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(usinas_router)
app.include_router(upload_router)
app.include_router(series_router)
app.include_router(data_router)
app.include_router(usina_info_router)
app.include_router(heatmap_router)
app.include_router(synthetic_router)
app.include_router(settings_router)
app.include_router(visualizacoes_router, prefix="/visualizacoes", tags=["Visualizações"])

# ── Criar pastas necessárias na inicialização ─────────────────────────────────

os.makedirs(DATA_DIR, exist_ok=True)

# ── Eventos de startup ────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    seed_default_admin()
    logger.info("=" * 60)
    logger.info("[SOLAR] Usina Solar API iniciada")
    logger.info(f"   Data dir: {DATA_DIR}")
    logger.info(f"   Docs:     http://localhost:8000/docs")
    logger.info("=" * 60)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Sistema"])
def health_check():
    """Verificação de saúde da API."""
    return {"status": "ok", "api": "Usina Solar v1.0.0"}
