import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from ..auth import (
    create_access_token,
    get_current_admin,
    get_current_user,
    get_password_hash,
    verify_password,
)
from ..database import DB_PATH, SessionLocal, get_db
from ..models import User

router = APIRouter(tags=["users"])

class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "user"
    can_simulate: bool = False
    can_edit_metrics: bool = False

class UserUpdate(BaseModel):
    role: str
    can_simulate: bool
    can_edit_metrics: bool

class PasswordUpdate(BaseModel):
    new_password: str

class OwnPasswordUpdate(BaseModel):
    current_password: str
    new_password: str

@router.get("/auth/setup-status")
def setup_status() -> dict[str, bool]:
    if not DB_PATH.exists():
        return {"needs_setup": True}

    with SessionLocal() as db:
        try:
            admin_count = db.scalar(select(func.count(User.id)).where(User.role == "admin"))
        except Exception:
            admin_count = 0
    return {"needs_setup": admin_count == 0}

@router.post("/auth/setup")
def setup_admin(data: UserCreate, db: Session = Depends(get_db)) -> dict[str, str]:
    admin_count = db.scalar(select(func.count(User.id)).where(User.role == "admin"))
    if admin_count > 0:
        raise HTTPException(status_code=400, detail="Admin account already exists")
        
    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(data.password)
    
    new_user = User(
        id=user_id,
        email=data.email,
        password_hash=hashed_password,
        role="admin",
        can_simulate=1,
        can_edit_metrics=1
    )
    db.add(new_user)
    db.commit()
    return {"message": "Admin account created successfully"}

@router.post("/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.scalar(select(User).where(User.email == form_data.username))
        
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(data={"sub": user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/auth/me")
def read_users_me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return current_user

@router.put("/auth/me/password")
def change_own_password(data: OwnPasswordUpdate, current_user: dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.get(User, current_user["id"])
    if not user or not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    user.password_hash = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password updated successfully"}

@router.get("/users")
def list_users(admin: dict[str, Any] = Depends(get_current_admin), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    users = db.scalars(select(User)).all()
    return [{"id": u.id, "email": u.email, "role": u.role, "can_simulate": bool(u.can_simulate), "can_edit_metrics": bool(u.can_edit_metrics)} for u in users]

@router.post("/users")
def create_user(data: UserCreate, admin: dict[str, Any] = Depends(get_current_admin), db: Session = Depends(get_db)) -> dict[str, str]:
    existing = db.scalar(select(User).where(User.email == data.email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(data.password)
    
    new_user = User(
        id=user_id,
        email=data.email,
        password_hash=hashed_password,
        role=data.role,
        can_simulate=int(data.can_simulate),
        can_edit_metrics=int(data.can_edit_metrics)
    )
    db.add(new_user)
    db.commit()
    return {"message": "User created"}

@router.put("/users/{user_id}")
def update_user(user_id: str, data: UserUpdate, admin: dict[str, Any] = Depends(get_current_admin), db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.role = data.role
    user.can_simulate = int(data.can_simulate)
    user.can_edit_metrics = int(data.can_edit_metrics)
    db.commit()
    return {"message": "User updated"}

@router.put("/users/{user_id}/password")
def reset_user_password(user_id: str, data: PasswordUpdate, admin: dict[str, Any] = Depends(get_current_admin), db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.password_hash = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password reset"}

@router.delete("/users/{user_id}")
def delete_user(user_id: str, admin: dict[str, Any] = Depends(get_current_admin), db: Session = Depends(get_db)) -> dict[str, str]:
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = db.get(User, user_id)
    if user:
        db.delete(user)
        db.commit()
    return {"message": "User deleted"}
