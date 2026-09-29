"""Lead operations shared by the UI API, CSV import and the public website-form API."""

import re
from datetime import date

from fastapi import HTTPException
from sqlalchemy import false, func, or_, select
from sqlalchemy.orm import Session

from .models import (
    CustomField,
    CustomFieldValue,
    Lead,
    LeadSource,
    LeadStatus,
    Priority,
    Tag,
    User,
    utcnow,
)
from .schemas import LeadOut, PriorityOut, SourceOut, StatusOut, TagOut, UserBrief
from .services import log_activity, manager_pref, notify, notify_admins, pick_assignee
from .settings_store import get_setting


def phone_digits(phone: str | None) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 6 else None


def fields_map(db: Session) -> dict[int, CustomField]:
    return {f.id: f for f in db.scalars(select(CustomField))}


def lead_out(lead: Lead, fields: dict[int, CustomField]) -> dict:
    custom = {fields[v.field_id].key: v.value for v in lead.custom_values if v.field_id in fields}
    return LeadOut(
        id=lead.id,
        code=lead.code,
        name=lead.name,
        phone=lead.phone,
        email=lead.email,
        company=lead.company,
        message=lead.message,
        notes=lead.notes,
        source=SourceOut.model_validate(lead.source) if lead.source else None,
        status=StatusOut.model_validate(lead.status) if lead.status else None,
        priority=PriorityOut.model_validate(lead.priority) if lead.priority else None,
        assigned_to=UserBrief.model_validate(lead.assigned_to) if lead.assigned_to else None,
        created_by=UserBrief.model_validate(lead.created_by) if lead.created_by else None,
        tags=[TagOut.model_validate(t) for t in lead.tags],
        custom=custom,
        enquiry_count=lead.enquiry_count,
        last_contact_at=lead.last_contact_at,
        next_followup_at=lead.next_followup_at,
        converted_at=lead.converted_at,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    ).model_dump(mode="json")


# ------------------------------------------------------------------ custom values

def _coerce(field: CustomField, value):
    """Validate/normalise a custom field value. Returns None for 'empty'."""
    if value is None or value == "" or value == []:
        return None
    t = field.field_type
    try:
        if t in ("number", "currency"):
            return float(value)
        if t == "checkbox":
            if isinstance(value, str):
                return value.strip().lower() in ("1", "true", "yes", "on", "y")
            return bool(value)
        if t == "date":
            return date.fromisoformat(str(value)[:10]).isoformat()
        if t == "email":
            v = str(value).strip()
            if "@" not in v:
                raise ValueError
            return v
        if t == "dropdown":
            v = str(value).strip()
            match = next((o for o in field.options if o.lower() == v.lower()), None)
            if match is None:
                raise ValueError
            return match
        if t == "multiselect":
            items = value if isinstance(value, list) else [s for s in str(value).split(",")]
            out = []
            for item in items:
                match = next((o for o in field.options if o.lower() == str(item).strip().lower()), None)
                if match is None:
                    raise ValueError
                out.append(match)
            return list(dict.fromkeys(out)) or None
        return str(value)
    except (ValueError, TypeError):
        raise HTTPException(400, f"Invalid value for field '{field.name}'")


def apply_custom(db: Session, lead: Lead, custom: dict, *, strict: bool = True) -> list[str]:
    """Set custom field values by key. Returns names of fields that changed."""
    by_key = {f.key: f for f in db.scalars(select(CustomField))}
    existing = {v.field_id: v for v in lead.custom_values}
    changed = []
    for key, raw in (custom or {}).items():
        field = by_key.get(key)
        if not field:
            continue
        try:
            value = _coerce(field, raw)
        except HTTPException:
            if strict:
                raise
            continue
        cur = existing.get(field.id)
        if value is None:
            if cur:
                lead.custom_values.remove(cur)
                changed.append(field.name)
        elif cur is None:
            lead.custom_values.append(CustomFieldValue(field_id=field.id, value=value))
            changed.append(field.name)
        elif cur.value != value:
            cur.value = value
            changed.append(field.name)
    return changed


def check_required(db: Session, lead: Lead) -> None:
    have = {v.field_id for v in lead.custom_values}
    for f in db.scalars(select(CustomField).where(CustomField.required.is_(True), CustomField.is_active.is_(True))):
        if f.id not in have:
            raise HTTPException(400, f"'{f.name}' is required")


# ------------------------------------------------------------------ lookups

def default_status(db: Session) -> LeadStatus | None:
    return db.scalar(select(LeadStatus).where(LeadStatus.is_default.is_(True))) or db.scalar(
        select(LeadStatus).order_by(LeadStatus.order))


def default_priority(db: Session) -> Priority | None:
    return db.scalar(select(Priority).where(Priority.is_default.is_(True)))


def source_by_text(db: Session, text: str | None, create: bool = True) -> LeadSource | None:
    if not text or not text.strip():
        return None
    t = text.strip()
    key = re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")
    src = db.scalar(select(LeadSource).where(or_(LeadSource.key == key, func.lower(LeadSource.name) == t.lower())))
    if src or not create or not key:
        return src
    src = LeadSource(name=t.replace("_", " ").title() if t.islower() else t, key=key,
                     order=(db.scalar(select(func.max(LeadSource.order))) or 0) + 1)
    db.add(src)
    db.flush()
    return src


def tags_by_names(db: Session, names) -> list[Tag]:
    if isinstance(names, str):
        names = names.split(",")
    out = []
    for n in names or []:
        n = str(n).strip()
        if not n:
            continue
        tag = db.scalar(select(Tag).where(func.lower(Tag.name) == n.lower()))
        if not tag:
            tag = Tag(name=n[:40])
            db.add(tag)
            db.flush()
        out.append(tag)
    return out


def find_duplicate(db: Session, phone: str | None, email: str | None) -> Lead | None:
    conds = []
    d = phone_digits(phone)
    if d:
        conds.append(Lead.phone_digits == d)
    if email and email.strip():
        conds.append(func.lower(Lead.email) == email.strip().lower())
    if not conds:
        return None
    return db.scalar(select(Lead).where(Lead.is_deleted == false(), or_(*conds)).order_by(Lead.created_at.desc()))


# ------------------------------------------------------------------ mutations

def create_lead(db: Session, *, data: dict, actor: User | None, via: str, tags: list[Tag] | None = None,
                custom: dict | None = None, strict_custom: bool = True, ip: str | None = None) -> Lead:
    """`via` = ui | api | import. Handles defaults, auto-assignment, logging and notifications."""
    lead = Lead(
        name=data["name"].strip(),
        phone=(data.get("phone") or "").strip() or None,
        email=(data.get("email") or "").strip().lower() or None,
        company=(data.get("company") or "").strip() or None,
        message=data.get("message"),
        notes=data.get("notes"),
        source_id=data.get("source_id"),
        status_id=data.get("status_id"),
        priority_id=data.get("priority_id"),
        assigned_to_id=data.get("assigned_to_id"),
        last_contact_at=data.get("last_contact_at"),
        created_by_id=actor.id if actor else None,
    )
    lead.phone_digits = phone_digits(lead.phone)
    if not lead.status_id:
        st = default_status(db)
        lead.status_id = st.id if st else None
    if not lead.priority_id:
        pr = default_priority(db)
        lead.priority_id = pr.id if pr else None
    lead.status_changed_at = utcnow()
    db.add(lead)
    db.flush()
    if tags:
        lead.tags = tags
    if custom:
        apply_custom(db, lead, custom, strict=strict_custom)
    if via == "ui":
        check_required(db, lead)

    status = db.get(LeadStatus, lead.status_id) if lead.status_id else None
    if status and status.category == "won":
        lead.converted_at = utcnow()

    # ---- assignment
    cfg = get_setting(db, "assignment")
    auto = False
    if lead.assigned_to_id is None:
        if actor and not actor.is_admin and cfg.get("managers_self_assign", True):
            lead.assigned_to_id = actor.id
        elif via in ("api", "import") or cfg.get("apply_to_manual"):
            assignee = pick_assignee(db, lead)
            if assignee:
                lead.assigned_to_id = assignee.id
                auto = True
    db.flush()
    db.refresh(lead)

    src = f" from {lead.source.name}" if lead.source else ""
    origin = {"ui": "", "api": " via website/API", "import": " via CSV import"}[via]
    who = actor.name if actor else "System"
    log_activity(db, "lead_created", f"{who} created lead {lead.name}{src}{origin}", user=actor, lead=lead,
                 meta={"via": via}, ip=ip)
    if lead.assigned_to:
        how = "automatically " if auto else ""
        log_activity(db, "lead_assigned", f"Lead {how}assigned to {lead.assigned_to.name}", user=actor if not auto else None,
                     lead=lead, meta={"to": lead.assigned_to_id, "auto": auto, "mode": cfg.get("mode") if auto else None})
        if manager_pref(db, "manager_assigned"):
            notify(db, lead.assigned_to_id, "lead_assigned", f"New lead assigned: {lead.name}",
                   f"{lead.phone or lead.email or ''}{src}".strip(), lead, actor)
    if via != "import":
        notify_admins(db, "admin_new_lead", "new_lead", f"New lead: {lead.name}",
                      f"{src.strip() or 'Manual entry'}" + (f" · assigned to {lead.assigned_to.name}" if lead.assigned_to else " · unassigned"),
                      lead, actor)
    return lead


def change_status(db: Session, lead: Lead, status: LeadStatus, actor: User | None, ip: str | None = None) -> bool:
    old = lead.status
    if old and old.id == status.id:
        return False
    lead.status_id = status.id
    lead.status_changed_at = utcnow()
    if status.category == "won" and not lead.converted_at:
        lead.converted_at = utcnow()
    elif status.category != "won":
        lead.converted_at = None
    who = actor.name if actor else "System"
    log_activity(
        db, "status_changed",
        f"{who} changed status of {lead.name}: {old.name if old else '—'} → {status.name}",
        user=actor, lead=lead, ip=ip,
        meta={"from": {"id": old.id, "name": old.name, "color": old.color} if old else None,
              "to": {"id": status.id, "name": status.name, "color": status.color}},
    )
    if manager_pref(db, "manager_lead_updated"):
        notify(db, lead.assigned_to_id, "lead_updated", f"{lead.name} moved to {status.name}",
               f"by {who}", lead, actor)
    if status.category == "won":
        notify_admins(db, "admin_conversion", "conversion", f"🎉 Converted: {lead.name}",
                      f"by {lead.assigned_to.name if lead.assigned_to else who}", lead, actor)
    else:
        notify_admins(db, "admin_status_change", "status_change", f"{lead.name}: {old.name if old else '—'} → {status.name}",
                      f"by {who}", lead, actor)
    return True


def assign_lead(db: Session, lead: Lead, user: User | None, actor: User | None, ip: str | None = None,
                reason: str | None = None) -> bool:
    if (lead.assigned_to_id or None) == (user.id if user else None):
        return False
    prev = lead.assigned_to
    lead.assigned_to_id = user.id if user else None
    who = actor.name if actor else "System"
    if user:
        desc = f"{who} assigned {lead.name} to {user.name}" + (f" (was {prev.name})" if prev else "")
    else:
        desc = f"{who} unassigned {lead.name}" + (f" from {prev.name}" if prev else "")
    if reason:
        desc += f" — {reason}"
    log_activity(db, "lead_assigned", desc, user=actor, lead=lead, ip=ip,
                 meta={"from": prev.id if prev else None, "to": user.id if user else None})
    if user and manager_pref(db, "manager_assigned"):
        notify(db, user.id, "lead_assigned", f"Lead assigned to you: {lead.name}", f"by {who}", lead, actor)
    if prev and manager_pref(db, "manager_assigned"):
        notify(db, prev.id, "lead_reassigned", f"{lead.name} was reassigned",
               f"to {user.name if user else 'nobody'} by {who}", lead, actor)
    return True
