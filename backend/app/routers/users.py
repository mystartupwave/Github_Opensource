from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import false, func, select, true, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PERMISSIONS, Lead, LeadFollowup, Role, User
from ..schemas import PasswordReset, RoleIn, RoleOut, UserBrief, UserCreate, UserOut, UserUpdate
from ..security import client_ip, get_current_user, hash_password, require_admin, validate_password
from ..services import log_activity, notify_admins

router = APIRouter(prefix="/api", tags=["users"])


def user_out(u: User) -> dict:
    return UserOut.model_validate(u).model_dump(mode="json")


# ------------------------------------------------------------------ users

@router.get("/users")
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.created_at)).all()
    counts = dict(db.execute(
        select(Lead.assigned_to_id, func.count(Lead.id)).where(Lead.is_deleted == false()).group_by(Lead.assigned_to_id)
    ).all())
    return [{**user_out(u), "lead_count": counts.get(u.id, 0)} for u in users]


@router.get("/users/options")
def user_options(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Lightweight list of active users for assignee dropdowns (any logged-in user)."""
    users = db.scalars(select(User).where(User.is_active == true()).order_by(User.name)).all()
    return [{**UserBrief.model_validate(u).model_dump(), "is_admin": u.is_admin} for u in users]


@router.post("/users", status_code=201)
def create_user(body: UserCreate, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    if db.scalar(select(User).where(func.lower(User.email) == body.email.lower())):
        raise HTTPException(400, "A user with this email already exists")
    role = db.get(Role, body.role_id)
    if not role:
        raise HTTPException(400, "Role not found")
    validate_password(db, body.password)
    user = User(name=body.name, email=body.email.lower(), phone=body.phone, role_id=role.id,
                is_active=body.is_active, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    log_activity(db, "user_created", f"{admin.name} created user {user.name} ({role.name})", user=admin,
                 meta={"target_user_id": user.id}, ip=client_ip(request))
    notify_admins(db, "admin_new_user", "user_created", f"New user: {user.name}", f"Role: {role.name}", actor=admin)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.get("/users/{user_id}")
def get_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user_out(user)


def _ensure_other_admin(db: Session, user: User) -> None:
    """Block changes that would leave the system without an active admin."""
    if not user.is_admin:
        return
    others = db.scalars(select(User).where(User.id != user.id, User.is_active == true())).all()
    if not any(o.is_admin for o in others):
        raise HTTPException(400, "This is the last active admin; add another admin first")


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)
    changes = []
    if "email" in data and data["email"]:
        data["email"] = data["email"].lower()
        clash = db.scalar(select(User).where(func.lower(User.email) == data["email"], User.id != user.id))
        if clash:
            raise HTTPException(400, "A user with this email already exists")
    if "role_id" in data and data["role_id"] != user.role_id:
        role = db.get(Role, data["role_id"])
        if not role:
            raise HTTPException(400, "Role not found")
        if not role.is_admin:
            _ensure_other_admin(db, user)
        changes.append(f"role → {role.name}")
    if data.get("is_active") is False and user.is_active:
        _ensure_other_admin(db, user)
        user.token_version += 1
        log_activity(db, "user_disabled", f"{admin.name} deactivated {user.name}", user=admin,
                     meta={"target_user_id": user.id}, ip=client_ip(request))
    if data.get("is_active") is True and not user.is_active:
        log_activity(db, "user_enabled", f"{admin.name} activated {user.name}", user=admin,
                     meta={"target_user_id": user.id}, ip=client_ip(request))
    for k, v in data.items():
        if k not in ("is_active", "role_id") and getattr(user, k) != v:
            changes.append(k)
        setattr(user, k, v)
    if changes:
        log_activity(db, "user_updated", f"{admin.name} updated {user.name}: {', '.join(changes)}", user=admin,
                     meta={"target_user_id": user.id}, ip=client_ip(request))
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, body: PasswordReset, request: Request, admin: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    validate_password(db, body.password)
    user.password_hash = hash_password(body.password)
    user.token_version += 1  # force re-login everywhere
    log_activity(db, "password_reset", f"{admin.name} reset the password of {user.name}", user=admin,
                 meta={"target_user_id": user.id}, ip=client_ip(request))
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, request: Request, reassign_to_id: int | None = None,
                admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    _ensure_other_admin(db, user)
    target = None
    if reassign_to_id:
        target = db.get(User, reassign_to_id)
        if not target or target.id == user.id:
            raise HTTPException(400, "Invalid reassignment target")
    db.execute(update(Lead).where(Lead.assigned_to_id == user.id).values(assigned_to_id=target.id if target else None))
    db.execute(update(LeadFollowup).where(LeadFollowup.assigned_to_id == user.id)
               .values(assigned_to_id=target.id if target else None))
    log_activity(db, "user_deleted",
                 f"{admin.name} deleted user {user.name}" + (f"; leads moved to {target.name}" if target else ""),
                 user=admin, meta={"target_user_id": user.id, "email": user.email}, ip=client_ip(request))
    db.delete(user)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ roles

@router.get("/roles")
def list_roles(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    roles = db.scalars(select(Role).order_by(Role.id)).all()
    counts = dict(db.execute(select(User.role_id, func.count(User.id)).group_by(User.role_id)).all())
    return {
        "roles": [{**RoleOut.model_validate(r).model_dump(), "user_count": counts.get(r.id, 0)} for r in roles],
        "permissions": [{"key": k, "label": v} for k, v in PERMISSIONS.items()],
    }


def _clean_perms(perms: list[str]) -> list[str]:
    return [p for p in dict.fromkeys(perms) if p in PERMISSIONS]


@router.post("/roles", status_code=201)
def create_role(body: RoleIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(Role).where(func.lower(Role.name) == body.name.lower())):
        raise HTTPException(400, "Role name already exists")
    role = Role(name=body.name, description=body.description, permissions=_clean_perms(body.permissions))
    db.add(role)
    log_activity(db, "role_created", f"{admin.name} created role {role.name}", user=admin, ip=client_ip(request))
    db.commit()
    return RoleOut.model_validate(role)


@router.patch("/roles/{role_id}")
def update_role(role_id: int, body: RoleIn, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    if role.is_admin:
        raise HTTPException(400, "The Admin role always has full access and cannot be edited")
    role.name = body.name
    role.description = body.description
    role.permissions = _clean_perms(body.permissions)
    log_activity(db, "role_updated", f"{admin.name} updated permissions of role {role.name}", user=admin,
                 meta={"permissions": role.permissions}, ip=client_ip(request))
    db.commit()
    return RoleOut.model_validate(role)


@router.delete("/roles/{role_id}")
def delete_role(role_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    if role.is_system:
        raise HTTPException(400, "Built-in roles cannot be deleted")
    if db.scalar(select(func.count(User.id)).where(User.role_id == role.id)):
        raise HTTPException(400, "Move the users in this role to another role first")
    db.delete(role)
    log_activity(db, "role_deleted", f"{admin.name} deleted role {role.name}", user=admin)
    db.commit()
    return {"ok": True}
