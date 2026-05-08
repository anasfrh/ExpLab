from datetime import datetime, timedelta
import os
import uuid
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
import bcrypt

from sqlalchemy.orm import Session
from .database import get_db
from .models import User

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-key-please-change-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    user = db.get(User, user_id)
        
    if user is None:
        raise credentials_exception
        
    return {"id": user.id, "email": user.email, "role": user.role, "can_simulate": bool(user.can_simulate), "can_edit_metrics": bool(user.can_edit_metrics)}

async def get_current_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

def check_can_simulate(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if not current_user["can_simulate"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to simulate data")
    return current_user

def check_can_edit_metrics(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if not current_user["can_edit_metrics"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to edit metrics")
    return current_user
