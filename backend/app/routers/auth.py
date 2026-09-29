from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PERMISSIONS, User
from ..schemas import LoginIn, PasswordChange, ProfileUpdate, UserOut
from ..security import (
    client_ip,
    create_token,
    get_current_user,
    hash_password,
    touch_login,
    validate_password,
    verify_password,
)
from ..services import log_activity
from ..settings_store import get_setting

router = APIRouter(prefix="/api/auth", tags=["auth"])


def me_payload(user: User) -> dict:
    data = UserOut.model_validate(user).model_dump(mode="json")
    data["permissions"] = list(PERMISSIONS) if user.is_admin else list(user.role.permissions or [])
    return data


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        if user:
            log_activity(db, "login_failed", f"Failed login attempt for {user.email}", user=user, ip=client_ip(request))
            db.commit()
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Your account has been deactivated. Contact your admin.")
    touch_login(db, user)
    log_activity(db, "login", f"{user.name} logged in", user=user, ip=client_ip(request))
    db.commit()
    hours = int(get_setting(db, "security").get("session_hours", 12))
    return {"access_token": create_token(user, hours), "token_type": "bearer", "user": me_payload(user)}


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log_activity(db, "logout", f"{user.name} logged out", user=user, ip=client_ip(request))
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return me_payload(user)


@router.patch("/me")
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    return me_payload(user)


@router.post("/change-password")
def change_password(body: PasswordChange, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    validate_password(db, body.new_password)
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    log_activity(db, "password_changed", f"{user.name} changed their password", user=user, ip=client_ip(request))
    db.commit()
    hours = int(get_setting(db, "security").get("session_hours", 12))
    return {"access_token": create_token(user, hours)}
