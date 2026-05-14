from fastapi import APIRouter, Depends, Body
from services.settings_service import load_element_settings, save_element_settings
from services.filter_settings_service import load_filter_settings, save_filter_settings
from routes.auth import require_analyst_or_admin, require_admin

router = APIRouter(prefix="/settings", tags=["Configurações"])

@router.get("/elements")
def get_elements_settings():
    """Retorna as configurações e cadastros de todos os elementos."""
    return load_element_settings()

@router.put("/elements")
def update_elements_settings(settings: list[dict] = Body(...), _: dict = Depends(require_admin)):
    """Atualiza as configurações de elementos (somente admin)."""
    save_element_settings(settings)
    return {"status": "ok", "message": "Configurações de elementos atualizadas."}

@router.get("/filters")
def get_filters_settings():
    """Retorna as configurações padrão de filtros."""
    return load_filter_settings()

@router.put("/filters")
def update_filters_settings(settings: list[dict] = Body(...), _: dict = Depends(require_admin)):
    """Atualiza as configurações padrão de filtros (somente admin)."""
    save_filter_settings(settings)
    return {"status": "ok", "message": "Configurações de filtros atualizadas."}
