"""
Rotas para gerenciar Séries Sintéticas (modelo em grupos/batches).
"""
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from services.synthetic_service import (
    load_synthetics,
    import_refs_from_excel,
    set_batch_formula,
    delete_batch,
)

router = APIRouter(tags=["Séries Sintéticas"])


@router.get("/synthetic")
def list_synthetics(usina: str = Query(...)):
    return load_synthetics(usina)


@router.post("/synthetic/import")
async def import_synthetic_excel(
    usina: str = Form(...),
    nome_grupo: Optional[str] = Form(""),
    file: UploadFile = File(...),
):
    content = await file.read()
    try:
        result = import_refs_from_excel(content, usina, nome_grupo or "")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result


class BatchPayload(BaseModel):
    formula: str
    nome: Optional[str] = None


@router.put("/synthetic/{batch_id}")
def update_batch(
    batch_id: str,
    payload: BatchPayload,
    usina: str = Query(...),
):
    try:
        result = set_batch_formula(usina, batch_id, payload.formula, payload.nome)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result


@router.delete("/synthetic/{batch_id}")
def remove_batch(
    batch_id: str,
    usina: str = Query(...),
):
    try:
        delete_batch(usina, batch_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"deleted": batch_id}
