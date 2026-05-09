"""
Schemas Pydantic — contratos de entrada e saída da API.
"""
from pydantic import BaseModel, Field
from typing import Optional
from utils.config import ELEMENTOS_VALIDOS


# ── Série ─────────────────────────────────────────────────────────────────────

class SeriesInfo(BaseModel):
    """Metadados completos de uma série temporal."""
    coluna: str                           # Nome original da coluna no Excel
    elemento: Optional[str] = None        # Tipo (ex: "Irradiação")
    skid: Optional[str] = None
    inversor: Optional[str] = None
    stringbox: Optional[str] = None
    estacao: Optional[str] = None         # Estação de monitoramento
    string: Optional[str] = None          # String Identifier
    mapeada: bool = False                 # True se encontrada no DE-PARA


# ── Upload ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    """Resposta do endpoint POST /upload."""
    filename: str
    date: str                            # Data detectada ex: "2025-12-04"
    series_count: int
    cached: bool = False


# ── Mapeamento DE-PARA ────────────────────────────────────────────────────────

class SeriesMapEntry(BaseModel):
    """Um registro do DE-PARA."""
    coluna_excel: str
    elemento: str
    skid: Optional[str] = None
    inversor: Optional[str] = None
    stringbox: Optional[str] = None
    estacao: Optional[str] = None
    string: Optional[str] = None


class SeriesMapRequest(BaseModel):
    """Body do POST /map-series."""
    mapeamentos: list[SeriesMapEntry]


class MappingImportResponse(BaseModel):
    """Resposta da importação do Excel DE-PARA."""
    total_mapeamentos: int
    linhas_invalidas: int
    elementos_encontrados: list[str]
    elementos_nao_cadastrados: list[str] = []
    skids_encontrados: list[str]
    inversores_encontrados: list[str] = []
    stringboxes_encontrados: list[str] = []
    estacoes_encontradas: list[str] = []
    strings_encontradas: list[str] = []


class MappingValidationResponse(BaseModel):
    """Resultado da validação do mapeamento contra um Parquet."""
    total_colunas_parquet: int
    total_mapeadas: int
    total_sem_mapeamento: int
    colunas_sem_mapeamento: list[str]


# ── Consulta de dados ─────────────────────────────────────────────────────────

class DataQueryParams(BaseModel):
    """Parâmetros para consulta de dados."""
    date: str
    series: Optional[list[str]] = None   # Nomes das colunas
    elemento: Optional[str] = None       # Filtro por tipo
    skid: Optional[str] = None
    start: Optional[str] = None          # "HH:MM"
    end: Optional[str] = None            # "HH:MM"


class DataResponse(BaseModel):
    """Resposta do endpoint GET /data."""
    dates: str
    timestamps: list[str]
    series: dict[str, list]              # { "coluna": [v1, v2, ...] }
    total_pontos: int


# ── Visualizações ─────────────────────────────────────────────────────────────

class VisualizationPayload(BaseModel):
    """Payload para salvar uma visualização de dashboard."""
    name: str
    user: str = "Desconhecido"
    selectedDates: list[str] = Field(default_factory=list)
    selectedSeries: list[str] = Field(default_factory=list)
    activeFilters: list[str] = Field(default_factory=list)
    visibleFilters: list[str] = Field(default_factory=list)
    filterColors: dict = Field(default_factory=dict)
    chartConfig: dict = Field(default_factory=dict)


class VisualizationResponse(VisualizationPayload):
    """Resposta com a visualização completa, incluindo ID e Timestamp."""
    id: str
    created_at: str
