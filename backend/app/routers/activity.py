from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Activity, Notification, User
from ..schemas import ActivityOut, NotificationOut
from ..security import get_current_user
from ..services import check_followup_reminders
from .leads import _local_date_to_utc

router = APIRouter(prefix="/api", tags=["activity"])

ACTION_LABELS = {
    "lead_created": "Lead created",
    "lead_edited": "Lead edited",
    "lead_assigned": "Lead assigned",
    "status_changed": "Status changed",
    "priority_changed": "Priority changed",
    "tags_changed": "Tags changed",
    "note_added": "Note added",
    "note_deleted": "Note deleted",
    "contacted": "Contact logged",
    "followup_created": "Follow-up created",
    "followup_completed": "Follow-up completed",
    "followup_rescheduled": "Follow-up rescheduled",
    "followup_cancelled": "Follow-up cancelled",
    "followup_deleted": "Follow-up deleted",
    "enquiry_repeat": "Repeat enquiry",
    "lead_deleted": "Lead deleted",
    "leads_imported": "Leads imported",
    "leads_exported": "Leads exported",
    "user_created": "User created",
    "user_updated": "User updated",
    "user_disabled": "User disabled",
    "user_enabled": "User enabled",
    "user_deleted": "User deleted",
    "password_reset": "Password reset",
    "password_changed": "Password changed",
    "role_created": "Role created",
    "role_updated": "Role updated",
    "role_deleted": "Role deleted",
    "settings_changed": "Settings changed",
    "login": "Login",
    "logout": "Logout",
    "login_failed": "Failed login",
}


@router.get("/activity/actions")
def actions(user: User = Depends(get_current_user)):
    return [{"key": k, "label": v} for k, v in ACTION_LABELS.items()]


@router.get("/activity")
def list_activity(
    user_id: int | None = None,
    lead_id: int | None = None,
    action: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    tz_offset: int = 0,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conds = []
    if not user.can("activity.view_all"):
        user_id = user.id  # managers only ever see their own trail
    if user_id:
        conds.append(Activity.user_id == user_id)
    if lead_id:
        conds.append(Activity.lead_id == lead_id)
    if action:
        conds.append(Activity.action.in_(action.split(",")))
    if q:
        conds.append(Activity.description.ilike(f"%{q}%"))
    if date_from and (dt := _local_date_to_utc(date_from, tz_offset)):
        conds.append(Activity.created_at >= dt)
    if date_to and (dt := _local_date_to_utc(date_to, tz_offset, end=True)):
        conds.append(Activity.created_at < dt)
    total = db.scalar(select(func.count(Activity.id)).where(*conds))
    rows = db.scalars(select(Activity).where(*conds).order_by(Activity.created_at.desc(), Activity.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).unique().all()
    items = []
    for a in rows:
        d = ActivityOut.model_validate(a).model_dump(mode="json")
        d["lead_name"] = a.lead.name if a.lead else None
        d["lead_deleted"] = bool(a.lead and a.lead.is_deleted)
        items.append(d)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ------------------------------------------------------------------ notifications

@router.get("/notifications")
def list_notifications(unread_only: bool = False, limit: int = Query(30, le=200),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_followup_reminders(db)
    conds = [Notification.user_id == user.id]
    if unread_only:
        conds.append(Notification.is_read.is_(False))
    rows = db.scalars(select(Notification).where(*conds).order_by(Notification.created_at.desc()).limit(limit)).all()
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id,
                                                                 Notification.is_read.is_(False)))
    return {"items": [NotificationOut.model_validate(n).model_dump(mode="json") for n in rows], "unread": unread}


@router.post("/notifications/{nid}/read")
def mark_read(nid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.id == nid, Notification.user_id == user.id).values(is_read=True))
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(is_read=True))
    db.commit()
    return {"ok": True}


@router.delete("/notifications")
def clear_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(True)))
    db.commit()
    return {"ok": True}
