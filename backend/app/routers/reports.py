"""Dashboard and analytics. Managers see numbers scoped to leads they can see."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, false, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..lead_core import fields_map, lead_out
from ..models import Activity, Lead, LeadFollowup, LeadSource, LeadStatus, User, utcnow
from ..security import get_current_user
from ..services import day_bounds, lead_visibility
from .leads import _local_date_to_utc

router = APIRouter(prefix="/api", tags=["reports"])

won = LeadStatus.category == "won"
lost = LeadStatus.category == "lost"


def _base(db: Session, user: User, date_from: str | None, date_to: str | None, tz: int) -> list:
    conds = [Lead.is_deleted == false(), lead_visibility(db, user)]
    if date_from and (dt := _local_date_to_utc(date_from, tz)):
        conds.append(Lead.created_at >= dt)
    if date_to and (dt := _local_date_to_utc(date_to, tz, end=True)):
        conds.append(Lead.created_at < dt)
    return conds


def _rate(conv: int, total: int) -> float:
    return round(conv * 100 / total, 1) if total else 0.0


@router.get("/dashboard")
def dashboard(
    tz_offset: int = 0,
    date_from: str | None = None,
    date_to: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conds = _base(db, user, date_from, date_to, tz_offset)
    now = utcnow()
    today, tomorrow, day_after = day_bounds(now, tz_offset)

    total = db.scalar(select(func.count(Lead.id)).where(*conds)) or 0
    new_today = db.scalar(select(func.count(Lead.id)).where(*conds, Lead.created_at >= today)) or 0
    new_week = db.scalar(select(func.count(Lead.id)).where(*conds, Lead.created_at >= today - timedelta(days=6))) or 0
    unassigned = db.scalar(select(func.count(Lead.id)).where(*conds, Lead.assigned_to_id.is_(None))) or 0

    by_status_rows = db.execute(
        select(LeadStatus.id, LeadStatus.name, LeadStatus.color, LeadStatus.category, func.count(Lead.id))
        .select_from(LeadStatus).join(Lead, and_(Lead.status_id == LeadStatus.id, *conds), isouter=True)
        .group_by(LeadStatus.id).order_by(LeadStatus.order)
    ).all()
    by_status = [{"id": r[0], "name": r[1], "color": r[2], "category": r[3], "count": r[4]} for r in by_status_rows]
    converted = sum(s["count"] for s in by_status if s["category"] == "won")
    lost_n = sum(s["count"] for s in by_status if s["category"] == "lost")

    by_source = [
        {"id": r[0], "name": r[1] or "Unknown", "color": r[2] or "#94a3b8", "count": r[3], "converted": r[4] or 0}
        for r in db.execute(
            select(LeadSource.id, LeadSource.name, LeadSource.color, func.count(Lead.id),
                   func.sum(case((won, 1), else_=0)))
            .select_from(Lead).join(LeadSource, Lead.source_id == LeadSource.id, isouter=True)
            .join(LeadStatus, Lead.status_id == LeadStatus.id, isouter=True)
            .where(*conds).group_by(LeadSource.id).order_by(func.count(Lead.id).desc())
        ).all()
    ]

    # Follow-up buckets, scoped the same way as the Follow-ups page.
    fu_scope = [Lead.is_deleted == false(), LeadFollowup.status == "pending"]
    if not user.can("leads.view_all"):
        fu_scope.append(LeadFollowup.assigned_to_id == user.id)
    fq = lambda *c: db.scalar(select(func.count(LeadFollowup.id)).join(Lead, Lead.id == LeadFollowup.lead_id)
                              .where(*fu_scope, *c)) or 0
    followups = {
        "overdue": fq(LeadFollowup.due_at < now),
        "today": fq(LeadFollowup.due_at >= now, LeadFollowup.due_at < tomorrow),
        "tomorrow": fq(LeadFollowup.due_at >= tomorrow, LeadFollowup.due_at < day_after),
    }

    # Leads per day for the last 14 days (local days).
    start = today - timedelta(days=13)
    shift = f"{'+' if tz_offset >= 0 else '-'}{abs(tz_offset)} minutes"
    day_expr = func.date(Lead.created_at, shift)
    daily_rows = dict(db.execute(select(day_expr, func.count(Lead.id)).where(*conds, Lead.created_at >= start)
                                 .group_by(day_expr)).all())
    trend = []
    for i in range(14):
        d = (start + timedelta(minutes=tz_offset) + timedelta(days=i)).date().isoformat()
        trend.append({"date": d, "count": daily_rows.get(d, 0)})

    managers = _manager_perf(db, user, conds) if user.can("reports.view") or user.is_admin else []

    recent = db.scalars(select(Lead).where(*conds).order_by(Lead.created_at.desc()).limit(8)).unique().all()
    fields = fields_map(db)

    return {
        "totals": {"total": total, "new_today": new_today, "new_week": new_week, "converted": converted,
                   "lost": lost_n, "open": total - converted - lost_n, "unassigned": unassigned,
                   "conversion_rate": _rate(converted, total)},
        "by_status": by_status,
        "by_source": by_source,
        "followups": followups,
        "trend": trend,
        "managers": managers,
        "recent": [lead_out(l, fields) for l in recent],
    }


def _manager_perf(db: Session, user: User, conds: list) -> list[dict]:
    rows = db.execute(
        select(User.id, User.name, func.count(Lead.id), func.sum(case((won, 1), else_=0)),
               func.sum(case((lost, 1), else_=0)))
        .select_from(User)
        .join(Lead, and_(Lead.assigned_to_id == User.id, *conds), isouter=True)
        .join(LeadStatus, Lead.status_id == LeadStatus.id, isouter=True)
        .where(User.is_active.is_(True))
        .group_by(User.id)
    ).all()
    created = dict(db.execute(select(Lead.created_by_id, func.count(Lead.id)).where(*conds)
                              .group_by(Lead.created_by_id)).all())
    out = []
    for uid, name, leads, conv, lst in rows:
        conv, lst = conv or 0, lst or 0
        if not leads:
            u = db.get(User, uid)
            if u and u.is_admin:
                continue  # admins only appear once they actually own leads
        out.append({"id": uid, "name": name, "leads": leads, "converted": conv, "lost": lst,
                    "open": leads - conv - lst, "created": created.get(uid, 0), "conversion_rate": _rate(conv, leads)})
    out.sort(key=lambda r: (-r["leads"], r["name"]))
    return out


@router.get("/reports")
def reports(
    tz_offset: int = 0,
    date_from: str | None = None,
    date_to: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.can("reports.view"):
        raise HTTPException(403, "You don't have access to reports")
    conds = _base(db, user, date_from, date_to, tz_offset)
    managers = _manager_perf(db, user, conds)

    # Activity volume per user (actions performed on leads in the period).
    act_conds = [Activity.lead_id.is_not(None)]
    if date_from and (dt := _local_date_to_utc(date_from, tz_offset)):
        act_conds.append(Activity.created_at >= dt)
    if date_to and (dt := _local_date_to_utc(date_to, tz_offset, end=True)):
        act_conds.append(Activity.created_at < dt)
    if not user.can("leads.view_all"):
        act_conds.append(Activity.user_id == user.id)
    acts = dict(db.execute(select(Activity.user_id, func.count(Activity.id)).where(*act_conds)
                           .group_by(Activity.user_id)).all())
    contacts = dict(db.execute(select(Activity.user_id, func.count(Activity.id))
                               .where(*act_conds, Activity.action.in_(["contacted", "followup_completed"]))
                               .group_by(Activity.user_id)).all())
    for m in managers:
        m["actions"] = acts.get(m["id"], 0)
        m["contacts"] = contacts.get(m["id"], 0)

    sources = [
        {"name": r[0] or "Unknown", "color": r[1] or "#94a3b8", "leads": r[2], "converted": r[3] or 0,
         "lost": r[4] or 0, "conversion_rate": _rate(r[3] or 0, r[2])}
        for r in db.execute(
            select(LeadSource.name, LeadSource.color, func.count(Lead.id), func.sum(case((won, 1), else_=0)),
                   func.sum(case((lost, 1), else_=0)))
            .select_from(Lead).join(LeadSource, Lead.source_id == LeadSource.id, isouter=True)
            .join(LeadStatus, Lead.status_id == LeadStatus.id, isouter=True)
            .where(*conds).group_by(LeadSource.id).order_by(func.count(Lead.id).desc())
        ).all()
    ]

    top_enquirers = [
        {"id": l.id, "code": l.code, "name": l.name, "phone": l.phone, "company": l.company,
         "enquiries": l.enquiry_count, "status": l.status.name if l.status else None,
         "status_color": l.status.color if l.status else None}
        for l in db.scalars(select(Lead).where(*conds, Lead.enquiry_count > 1)
                            .order_by(Lead.enquiry_count.desc(), Lead.updated_at.desc()).limit(15)).unique()
    ]

    # Average days to convert per manager.
    speed = dict(db.execute(
        select(Lead.assigned_to_id, func.avg(func.julianday(Lead.converted_at) - func.julianday(Lead.created_at)))
        .where(*conds, Lead.converted_at.is_not(None)).group_by(Lead.assigned_to_id)
    ).all())
    for m in managers:
        v = speed.get(m["id"])
        m["avg_days_to_convert"] = round(v, 1) if v is not None else None

    return {
        "managers": managers,
        "most_active": sorted(managers, key=lambda m: -m["actions"]),
        "most_created": sorted(managers, key=lambda m: -m["created"]),
        "most_converted": sorted(managers, key=lambda m: (-m["converted"], -m["conversion_rate"])),
        "sources": sources,
        "top_enquirers": top_enquirers,
    }
