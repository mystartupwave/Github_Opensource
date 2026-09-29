from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Lead, LeadFollowup, User, utcnow
from ..schemas import FollowupOut, FollowupUpdate, to_naive_utc
from ..security import client_ip, get_current_user
from ..services import can_see_lead, day_bounds, lead_visibility, log_activity, recompute_next_followup

router = APIRouter(prefix="/api/followups", tags=["followups"])


def _scope(db: Session, user: User, assigned_to: str | None):
    conds = [Lead.is_deleted == false()]
    if user.can("leads.view_all"):
        if assigned_to == "me":
            conds.append(LeadFollowup.assigned_to_id == user.id)
        elif assigned_to and assigned_to.isdigit():
            conds.append(LeadFollowup.assigned_to_id == int(assigned_to))
    else:
        conds.append(or_(LeadFollowup.assigned_to_id == user.id, lead_visibility(db, user)))
    return conds


def _bucket(bucket: str, tz_offset: int):
    now = utcnow()
    _, tomorrow, day_after = day_bounds(now, tz_offset)
    pending = LeadFollowup.status == "pending"
    return {
        "overdue": and_(pending, LeadFollowup.due_at < now),
        "today": and_(pending, LeadFollowup.due_at >= now, LeadFollowup.due_at < tomorrow),
        "tomorrow": and_(pending, LeadFollowup.due_at >= tomorrow, LeadFollowup.due_at < day_after),
        "upcoming": and_(pending, LeadFollowup.due_at >= day_after),
        "pending": pending,
        "done": LeadFollowup.status.in_(["done", "cancelled"]),
    }.get(bucket)


@router.get("")
def list_followups(
    bucket: str = Query("pending", pattern="^(overdue|today|tomorrow|upcoming|pending|done|all)$"),
    assigned_to: str | None = None,
    tz_offset: int = 0,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conds = _scope(db, user, assigned_to)
    b = _bucket(bucket, tz_offset)
    if b is not None:
        conds.append(b)
    base = select(LeadFollowup).join(Lead, Lead.id == LeadFollowup.lead_id).where(*conds)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    order = LeadFollowup.completed_at.desc() if bucket == "done" else LeadFollowup.due_at.asc()
    rows = db.scalars(base.order_by(order).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return {"items": [FollowupOut.model_validate(f).model_dump(mode="json") for f in rows], "total": total}


@router.get("/summary")
def summary(tz_offset: int = 0, assigned_to: str | None = None, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    out = {}
    for b in ("overdue", "today", "tomorrow", "upcoming"):
        conds = _scope(db, user, assigned_to) + [_bucket(b, tz_offset)]
        out[b] = db.scalar(select(func.count(LeadFollowup.id)).join(Lead, Lead.id == LeadFollowup.lead_id).where(*conds))
    return out


def _get(db: Session, user: User, fid: int) -> LeadFollowup:
    f = db.get(LeadFollowup, fid)
    if not f or not (f.assigned_to_id == user.id or can_see_lead(db, user, f.lead)):
        raise HTTPException(404, "Follow-up not found")
    return f


@router.patch("/{followup_id}")
def update_followup(followup_id: int, body: FollowupUpdate, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    f = _get(db, user, followup_id)
    lead = f.lead
    data = body.model_dump(exclude_unset=True)
    ip = client_ip(request)
    if "due_at" in data and data["due_at"]:
        new_due = to_naive_utc(data["due_at"])
        if new_due != f.due_at:
            f.due_at = new_due
            f.notified_due = f.notified_overdue = False
            if f.status == "pending":
                log_activity(db, "followup_rescheduled", f"{user.name} rescheduled a {f.type} follow-up", user=user,
                             lead=lead, ip=ip, meta={"due_at": new_due.isoformat() + "Z"})
    for k in ("type", "note", "outcome"):
        if k in data:
            setattr(f, k, data[k])
    if "status" in data and data["status"] != f.status:
        f.status = data["status"]
        if f.status == "done":
            f.completed_at = utcnow()
            lead.last_contact_at = utcnow()
            log_activity(db, "followup_completed", f"{user.name} completed a {f.type} follow-up", user=user, lead=lead,
                         ip=ip, meta={"outcome": f.outcome, "note": f.note})
        elif f.status == "cancelled":
            f.completed_at = utcnow()
            log_activity(db, "followup_cancelled", f"{user.name} cancelled a {f.type} follow-up", user=user, lead=lead,
                         ip=ip, meta={"note": f.note})
        else:
            f.completed_at = None
    recompute_next_followup(db, lead)
    db.commit()
    db.refresh(f)
    return FollowupOut.model_validate(f).model_dump(mode="json")


@router.delete("/{followup_id}")
def delete_followup(followup_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = _get(db, user, followup_id)
    lead = f.lead
    log_activity(db, "followup_deleted", f"{user.name} deleted a {f.type} follow-up", user=user, lead=lead)
    db.delete(f)
    recompute_next_followup(db, lead)
    db.commit()
    return {"ok": True}
