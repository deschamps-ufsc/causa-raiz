"""
auth.py — Endpoints de autenticação.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional

from services.auth_service import (
    authenticate_user,
    create_access_token,
    decode_token,
    list_users,
    create_user,
    update_user,
    delete_user,
)

router = APIRouter(prefix="/auth", tags=["Autenticação"])
bearer = HTTPBearer(auto_error=False)


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str
    name: str
    role: str


class UserCreate(BaseModel):
    email: str
    name: str
    role: str = "user"
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    email: str
    name: str
    role: str


# ── Dependência de autenticação ───────────────────────────────────────────────

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado.")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado.")
    return payload


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores.")
    return current_user


def require_analyst_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ("admin", "analyst"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a analistas e administradores.")
    return current_user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    """Autentica um usuário e retorna um token JWT."""
    user = authenticate_user(body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos.",
        )
    token = create_access_token({"sub": user["email"], "email": user["email"], "role": user.get("role", "user"), "name": user.get("name", "")})
    return LoginResponse(
        access_token=token,
        email=user["email"],
        name=user.get("name", ""),
        role=user.get("role", "user"),
    )


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    """Retorna os dados do usuário autenticado."""
    return {
        "email": current_user.get("email"),
        "name": current_user.get("name", ""),
        "role": current_user.get("role", "user"),
    }


@router.get("/users", response_model=list[UserOut])
def get_users(_: dict = Depends(require_admin)):
    """Lista todos os usuários (Admin only)."""
    return list_users()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def add_user(body: UserCreate, _: dict = Depends(require_admin)):
    """Cria um novo usuário (Admin only)."""
    try:
        return create_user(body.email, body.name, body.role, body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/users/{email}", response_model=UserOut)
def edit_user(email: str, body: UserUpdate, _: dict = Depends(require_admin)):
    """Atualiza nome, perfil ou senha de um usuário (Admin only)."""
    try:
        return update_user(email, body.name, body.role, body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/users/{email}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user(email: str, _: dict = Depends(require_admin)):
    """Remove um usuário (Admin only)."""
    try:
        delete_user(email)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
