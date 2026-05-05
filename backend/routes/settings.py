from fastapi import APIRouter, Depends, Body
from services.settings_service import load_element_settings, save_element_settings
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
