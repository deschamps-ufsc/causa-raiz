import os
import json
import tempfile
import pvlib
from fastapi import APIRouter, Depends, Body, File, UploadFile, HTTPException
from services.settings_service import load_element_settings, save_element_settings, load_equipamentos, save_equipamentos
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

@router.get("/equipamentos")
def get_equipamentos():
    """Retorna o banco de módulos e inversores."""
    return load_equipamentos()

@router.put("/equipamentos")
def update_equipamentos(data: dict = Body(...), _: dict = Depends(require_admin)):
    """Atualiza o banco de módulos e inversores (somente admin)."""
    save_equipamentos(data)
    return {"status": "ok", "message": "Equipamentos atualizados."}

@router.post("/import-pan")
async def import_pan_file(file: UploadFile = File(...), _: dict = Depends(require_admin)):
    """Recebe um arquivo .PAN, faz o parse com pvlib e retorna os dados em JSON."""
    if not file.filename.lower().endswith('.pan'):
        raise HTTPException(status_code=400, detail="Arquivo deve ter extensão .PAN")
        
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pan") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
            
        data = pvlib.iotools.read_panond(tmp_path, encoding='utf-8')
        os.remove(tmp_path)
        try:
            with open("last_pan.json", "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass
        return {"status": "ok", "data": data}
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo .PAN: {str(e)}")

@router.post("/import-ond")
async def import_ond_file(file: UploadFile = File(...), _: dict = Depends(require_admin)):
    """Recebe um arquivo .OND, faz o parse com pvlib e retorna os dados em JSON."""
    if not file.filename.lower().endswith('.ond'):
        raise HTTPException(status_code=400, detail="Arquivo deve ter extensão .OND")
        
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".ond") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
            
        data = pvlib.iotools.read_panond(tmp_path, encoding='utf-8')
        os.remove(tmp_path)
        try:
            with open("last_ond.json", "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass
        return {"status": "ok", "data": data}
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo .OND: {str(e)}")
