"""
auth_service.py — Serviço de autenticação.
Gerencia usuários, senhas (bcrypt) e tokens JWT.
Armazena usuários em users.json na raiz do backend.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
from jose import JWTError, jwt

# ── Configurações ─────────────────────────────────────────────────────────────

SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "causa-raiz-solar-secret-key-change-in-prod-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 horas

USERS_FILE = Path(__file__).parent.parent / "users.json"

# Admin padrão (seed)
DEFAULT_ADMIN = {
    "email": "deschamps.ufsc@gmail.com",
    "name": "Deschamps",
    "role": "admin",
    "password_hash": "",  # preenchido no seed
}
DEFAULT_ADMIN_PASSWORD = "Solar@123"


# ── Helpers internos ──────────────────────────────────────────────────────────

def _load_users() -> list[dict]:
    if not USERS_FILE.exists():
        return []
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_users(users: list[dict]) -> None:
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def _find_user(email: str) -> Optional[dict]:
    return next((u for u in _load_users() if u["email"].lower() == email.lower()), None)


# ── Seed do admin padrão ──────────────────────────────────────────────────────

def seed_default_admin() -> None:
    """Cria o admin padrão na primeira execução se não existir nenhum admin."""
    users = _load_users()
    has_admin = any(u.get("role") == "admin" for u in users)
    if has_admin:
        return

    admin = dict(DEFAULT_ADMIN)
    admin["password_hash"] = hash_password(DEFAULT_ADMIN_PASSWORD)
    users.append(admin)
    _save_users(users)


# ── Senha ─────────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ── Autenticação ──────────────────────────────────────────────────────────────

def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = _find_user(email)
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


# ── CRUD de usuários ──────────────────────────────────────────────────────────

def list_users() -> list[dict]:
    """Retorna lista de usuários sem o hash de senha."""
    return [
        {"email": u["email"], "name": u.get("name", ""), "role": u.get("role", "user")}
        for u in _load_users()
    ]


def create_user(email: str, name: str, role: str, password: str) -> dict:
    users = _load_users()
    if any(u["email"].lower() == email.lower() for u in users):
        raise ValueError(f"Usuário '{email}' já existe.")
    user = {
        "email": email,
        "name": name,
        "role": role,
        "password_hash": hash_password(password),
    }
    users.append(user)
    _save_users(users)
    return {"email": email, "name": name, "role": role}


def update_user(email: str, name: Optional[str] = None, role: Optional[str] = None, password: Optional[str] = None) -> dict:
    users = _load_users()
    user = next((u for u in users if u["email"].lower() == email.lower()), None)
    if not user:
        raise ValueError(f"Usuário '{email}' não encontrado.")
    if name is not None:
        user["name"] = name
    if role is not None:
        user["role"] = role
    if password:
        user["password_hash"] = hash_password(password)
    _save_users(users)
    return {"email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user")}


def delete_user(email: str) -> None:
    users = _load_users()
    remaining = [u for u in users if u["email"].lower() != email.lower()]
    if len(remaining) == len(users):
        raise ValueError(f"Usuário '{email}' não encontrado.")
    # Não deixa deletar o último admin
    if not any(u.get("role") == "admin" for u in remaining):
        raise ValueError("Não é possível remover o último administrador.")
    _save_users(remaining)
