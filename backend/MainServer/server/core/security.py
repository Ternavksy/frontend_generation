from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
from fastapi import HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext

from server.core.config import settings

# Настройки парольного хеширования
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Хеширование пароля"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Создание JWT access-токена"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.AUTH_SECRET, algorithm=settings.ALGORITHM)

def create_refresh_token(data: dict) -> str:
    """Создание JWT refresh-токена"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.AUTH_SECRET, algorithm=settings.ALGORITHM)

def decode_token(token: str, token_type: str = "access") -> dict:
    """Декодирование и валидация токена"""
    try:
        payload = jwt.decode(token, settings.AUTH_SECRET, algorithms=[settings.ALGORITHM])
        if payload.get("type") != token_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

def get_token(request: Request) -> str:
    """Извлечение токена из запроса"""
    credentials: HTTPAuthorizationCredentials | None = security(request)
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials

async def validate_token(token: str, token_type: str = "access") -> dict:
    """Валидация токена с возвратом пейлоада"""
    return decode_token(token, token_type)

def get_current_user_payload(token: str = None) -> dict:
    """Получение данных пользователя из токена (для зависимостей)"""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token required",
        )
    return decode_token(token)


def _callback_secret() -> str:
    return settings.ADMIN.AUTH_SECRET or settings.ADMIN.SESSION_SECRET or "dsa-callback-secret"


def generate_callback_token(task_id: str | UUID) -> str:
    return jwt.encode(
        {"sub": str(task_id), "type": "analysis_callback"},
        _callback_secret(),
        algorithm=settings.ADMIN.ALGORITHM,
    )


def verify_callback_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, _callback_secret(), algorithms=[settings.ADMIN.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "analysis_callback":
        return None
    return payload.get("sub")
