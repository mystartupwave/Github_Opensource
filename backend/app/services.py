"""Cross-cutting domain logic: activity logging, notifications, auto-assignment, visibility."""

from datetime import datetime, timedelta

from sqlalchemy import and_, false, func, or_, select, true
from sqlalchemy.orm import Session

from .models import (
    Activity,
    Lead,
    LeadFollowup,
    LeadStatus,
    Notification,
    User,
    utcnow,
)
from .settings_store import get_setting, set_setting


# ---------------------------------------------------------------- activity log

def log_activity(
    db: Session,
    action: str,
    description: str,
    user: User | None = None,
    lead: Lead | None = None,
    meta: dict | None = None,
    ip: str | None = None,
) -> Activity:
    act = Activity(
        action=action,
        description=description,
        user_id=user.id if user else None,
        lead_id=lead.id if lead else None,
        meta=meta,
        ip=ip,
    )
    db.add(act)
    return act


# ------------------------------------------------------------- notifications

def notify(db: Session, user_id: int | None, type_: str, title: str, body: str | None = None,
           lead: Lead | None = None, actor: User | None = None) -> None:
    """Queue an in-app notification. Never notifies the actor about their own action."""
    if not user_id or (actor and actor.id == user_id):
        return
    db.add(Notification(user_id=user_id, type=type_, title=title, body=body, lead_id=lead.id if lead else None))


def notify_admins(db: Session, pref: str, type_: str, title: str, body: str | None = None,
                  lead: Lead | None = None, actor: User | None = None) -> None:
    if not get_setting(db, "notifications").get(pref, True):
        return
    admins = db.scalars(select(User).where(User.is_active == true())).all()
    for admin in admins:
        if admin.is_admin:
            notify(db, admin.id, type_, title, body, lead, actor)


def manager_pref(db: Session, pref: str) -> bool:
    return bool(get_setting(db, "notifications").get(pref, True))


# ------------------------------------------------------------- assignment

def _assignable_pool(db: Session, ids: list[int] | None) -> list[User]:
    q = select(User).where(User.is_active == true()).order_by(User.id)
    users = db.scalars(q).all()
    if ids:
        wanted = set(ids)
        return [u for u in users if u.id in wanted]
    return [u for u in users if not u.is_admin]


def _least_loaded(db: Session, pool: list[User]) -> User | None:
    if not pool:
        return None
    counts = dict(
        db.execute(
            select(Lead.assigned_to_id, func.count(Lead.id))
            .join(LeadStatus, Lead.status_id == LeadStatus.id, isouter=True)
            .where(Lead.is_deleted == false(), Lead.assigned_to_id.in_([u.id for u in pool]),
                   or_(LeadStatus.category == "open", LeadStatus.id.is_(None)))
            .group_by(Lead.assigned_to_id)
        ).all()
    )
    return min(pool, key=lambda u: (counts.get(u.id, 0), u.id))


def _round_robin(db: Session, pool: list[User], cfg: dict) -> User | None:
    if not pool:
        return None
    pointer = int(cfg.get("rr_pointer") or 0)
    user = pool[pointer % len(pool)]
    set_setting(db, "assignment", {"rr_pointer": (pointer + 1) % len(pool)}, commit=False)
    return user


def pick_assignee(db: Session, lead: Lead) -> User | None:
    """Return the user a brand-new lead should go to, per Admin → Assignment settings."""
    cfg = get_setting(db, "assignment")
    if not cfg.get("auto_assign"):
        return None
    mode = cfg.get("mode", "round_robin")
    if mode == "shared":
        return None

    if mode == "specific":
        uid = cfg.get("specific_user_id")
        user = db.get(User, uid) if uid else None
        if user and user.is_active:
            return user
        mode = "round_robin"

    if mode == "rules":
        for rule in cfg.get("rules") or []:
            if rule.get("source_id") and rule.get("source_id") == lead.source_id:
                pool = _assignable_pool(db, rule.get("user_ids") or [])
                if pool:
                    return _least_loaded(db, pool)
        mode = cfg.get("fallback", "round_robin")
        if mode == "manual":
            return None

    pool = _assignable_pool(db, cfg.get("manager_ids") or [])
    if mode == "least_loaded":
        return _least_loaded(db, pool)
    return _round_robin(db, pool, cfg)


def is_shared_mode(db: Session) -> bool:
    cfg = get_setting(db, "assignment")
    return bool(cfg.get("auto_assign")) and cfg.get("mode") == "shared"


# ------------------------------------------------------------- visibility

def lead_visibility(db: Session, user: User):
    """SQL condition restricting leads to what `user` may see."""
    if user.can("leads.view_all"):
        return true()
    cond = Lead.assigned_to_id == user.id
    if is_shared_mode(db):
        cond = or_(cond, Lead.assigned_to_id.is_(None))
    return cond


def can_see_lead(db: Session, user: User, lead: Lead) -> bool:
    if lead.is_deleted:
        return False
    if user.can("leads.view_all") or lead.assigned_to_id == user.id:
        return True
    return lead.assigned_to_id is None and is_shared_mode(db)


# ------------------------------------------------------------- follow-ups

def recompute_next_followup(db: Session, lead: Lead) -> None:
    db.flush()
    lead.next_followup_at = db.scalar(
        select(func.min(LeadFollowup.due_at)).where(
            LeadFollowup.lead_id == lead.id, LeadFollowup.status == "pending"
        )
    )


def check_followup_reminders(db: Session) -> int:
    """Create due / overdue notifications. Idempotent; safe to call often."""
    prefs = get_setting(db, "notifications")
    now = utcnow()
    created = 0
    due: list[LeadFollowup] = []
    overdue: list[LeadFollowup] = []
    soon =now + timedelta(minutes=int(prefs.get("followup_reminder_minutes", 30)))

    if prefs.get("manager_followup_due", True):
        due = db.scalars(
            select(LeadFollowup).where(
                LeadFollowup.status == "pending",
                LeadFollowup.notified_due == false(),
                LeadFollowup.due_at <= soon,
                LeadFollowup.due_at >= now - timedelta(minutes=15),
            )
        ).all()
        for f in due:
            f.notified_due = True
            if f.lead and not f.lead.is_deleted:
                notify(db, f.assigned_to_id, "followup_due", f"Follow-up due: {f.lead.name}",
                       f.note or f"{f.type.title()} scheduled", f.lead)
                created += 1

    if prefs.get("manager_followup_overdue", True):
        overdue = db.scalars(
            select(LeadFollowup).where(
                LeadFollowup.status == "pending",
                LeadFollowup.notified_overdue == false(),
                LeadFollowup.due_at < now - timedelta(minutes=15),
            )
        ).all()
        for f in overdue:
            f.notified_overdue = True
            f.notified_due = True
            if f.lead and not f.lead.is_deleted:
                notify(db, f.assigned_to_id, "followup_overdue", f"Overdue follow-up: {f.lead.name}",
                       f.note or f"{f.type.title()} was due", f.lead)
                created += 1
    if created or due or overdue:
        db.commit()
    return created


def day_bounds(now: datetime, offset_minutes: int = 0):
    """Start of today/tomorrow/day-after in UTC for a client with the given UTC offset."""
    local = now + timedelta(minutes=offset_minutes)
    start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    start = start_local - timedelta(minutes=offset_minutes)
    return start, start + timedelta(days=1), start + timedelta(days=2)


def status_category_filter(category: str):
    return and_(Lead.status_id == LeadStatus.id, LeadStatus.category == category)
