import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import false, func, select, true, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    CUSTOM_FIELD_TYPES,
    CustomField,
    Lead,
    LeadSource,
    LeadStatus,
    Priority,
    Tag,
    User,
)
from ..schemas import (
    CustomFieldIn,
    CustomFieldOut,
    PriorityIn,
    PriorityOut,
    ReorderIn,
    SourceIn,
    SourceOut,
    StatusIn,
    StatusOut,
    TagIn,
    TagOut,
    UserBrief,
)
from ..security import get_current_user, require_admin
from ..services import is_shared_mode, log_activity
from ..settings_store import get_setting

router = APIRouter(prefix="/api", tags=["customization"])


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "item"


def _unique_key(db: Session, model, base: str, exclude_id: int | None = None) -> str:
    key, n = base, 2
    while True:
        q = select(model).where(model.key == key)
        if exclude_id:
            q = q.where(model.id != exclude_id)
        if not db.scalar(q):
            return key
        key = f"{base}_{n}"
        n += 1


def _next_order(db: Session, model) -> int:
    return (db.scalar(select(func.max(model.order))) or 0) + 1


def _reorder(db: Session, model, ids: list[int]) -> None:
    for i, id_ in enumerate(ids):
        db.execute(update(model).where(model.id == id_).values(order=i))


def _clear_default(db: Session, model, keep_id: int) -> None:
    db.execute(update(model).where(model.id != keep_id).values(is_default=False))


@router.get("/meta")
def meta(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everything the UI needs to render forms, filters and badges in one request."""
    users = db.scalars(select(User).where(User.is_active == true()).order_by(User.name)).all()
    company = get_setting(db, "company")
    messaging = get_setting(db, "messaging")
    return {
        "messaging": {"country_code": messaging.get("country_code", "91"), "templates": messaging.get("templates", [])},
        "statuses": [StatusOut.model_validate(s) for s in db.scalars(select(LeadStatus).order_by(LeadStatus.order))],
        "sources": [SourceOut.model_validate(s) for s in db.scalars(select(LeadSource).order_by(LeadSource.order))],
        "priorities": [PriorityOut.model_validate(p) for p in db.scalars(select(Priority).order_by(Priority.order))],
        "tags": [TagOut.model_validate(t) for t in db.scalars(select(Tag).order_by(Tag.name))],
        "custom_fields": [CustomFieldOut.model_validate(f) for f in
                          db.scalars(select(CustomField).order_by(CustomField.order))],
        "users": [{**UserBrief.model_validate(u).model_dump(), "is_admin": u.is_admin} for u in users],
        "field_types": CUSTOM_FIELD_TYPES,
        "shared_mode": is_shared_mode(db),
        "company": {k: company.get(k) for k in ("name", "currency", "currency_symbol", "timezone")},
    }


# ------------------------------------------------------------------ statuses

@router.post("/statuses", status_code=201)
def create_status(body: StatusIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = LeadStatus(**body.model_dump(), order=_next_order(db, LeadStatus))
    db.add(s)
    db.flush()
    if s.is_default:
        _clear_default(db, LeadStatus, s.id)
    log_activity(db, "settings_changed", f"{admin.name} created status {s.name}", user=admin)
    db.commit()
    return StatusOut.model_validate(s)


@router.put("/statuses/reorder")
def reorder_statuses(body: ReorderIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _reorder(db, LeadStatus, body.ids)
    db.commit()
    return {"ok": True}


@router.patch("/statuses/{status_id}")
def update_status(status_id: int, body: StatusIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(LeadStatus, status_id)
    if not s:
        raise HTTPException(404, "Status not found")
    old = s.name
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    if s.is_default:
        _clear_default(db, LeadStatus, s.id)
    log_activity(db, "settings_changed", f"{admin.name} updated status {old}" + (f" → {s.name}" if old != s.name else ""),
                 user=admin)
    db.commit()
    return StatusOut.model_validate(s)


@router.delete("/statuses/{status_id}")
def delete_status(status_id: int, move_to_id: int | None = None, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    s = db.get(LeadStatus, status_id)
    if not s:
        raise HTTPException(404, "Status not found")
    if db.scalar(select(func.count(LeadStatus.id))) <= 1:
        raise HTTPException(400, "At least one status is required")
    in_use = db.scalar(select(func.count(Lead.id)).where(Lead.status_id == s.id, Lead.is_deleted == false()))
    if in_use:
        target = db.get(LeadStatus, move_to_id) if move_to_id else None
        if not target or target.id == s.id:
            raise HTTPException(400, f"{in_use} lead(s) use this status. Choose a status to move them to.")
        db.execute(update(Lead).where(Lead.status_id == s.id).values(status_id=target.id))
    log_activity(db, "settings_changed", f"{admin.name} deleted status {s.name}", user=admin)
    db.delete(s)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ sources

@router.post("/sources", status_code=201)
def create_source(body: SourceIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    key = _unique_key(db, LeadSource, slugify(body.key or body.name))
    s = LeadSource(name=body.name, key=key, color=body.color, is_active=body.is_active,
                   order=_next_order(db, LeadSource))
    db.add(s)
    log_activity(db, "settings_changed", f"{admin.name} created source {s.name}", user=admin)
    db.commit()
    return SourceOut.model_validate(s)


@router.put("/sources/reorder")
def reorder_sources(body: ReorderIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _reorder(db, LeadSource, body.ids)
    db.commit()
    return {"ok": True}


@router.patch("/sources/{source_id}")
def update_source(source_id: int, body: SourceIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(LeadSource, source_id)
    if not s:
        raise HTTPException(404, "Source not found")
    s.name, s.color, s.is_active = body.name, body.color, body.is_active
    if body.key:
        s.key = _unique_key(db, LeadSource, slugify(body.key), exclude_id=s.id)
    log_activity(db, "settings_changed", f"{admin.name} updated source {s.name}", user=admin)
    db.commit()
    return SourceOut.model_validate(s)


@router.delete("/sources/{source_id}")
def delete_source(source_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(LeadSource, source_id)
    if not s:
        raise HTTPException(404, "Source not found")
    db.execute(update(Lead).where(Lead.source_id == s.id).values(source_id=None))
    log_activity(db, "settings_changed", f"{admin.name} deleted source {s.name}", user=admin)
    db.delete(s)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ priorities

@router.post("/priorities", status_code=201)
def create_priority(body: PriorityIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = Priority(**body.model_dump(), order=_next_order(db, Priority))
    db.add(p)
    db.flush()
    if p.is_default:
        _clear_default(db, Priority, p.id)
    log_activity(db, "settings_changed", f"{admin.name} created priority {p.name}", user=admin)
    db.commit()
    return PriorityOut.model_validate(p)


@router.put("/priorities/reorder")
def reorder_priorities(body: ReorderIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _reorder(db, Priority, body.ids)
    db.commit()
    return {"ok": True}


@router.patch("/priorities/{priority_id}")
def update_priority(priority_id: int, body: PriorityIn, admin: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    p = db.get(Priority, priority_id)
    if not p:
        raise HTTPException(404, "Priority not found")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    if p.is_default:
        _clear_default(db, Priority, p.id)
    log_activity(db, "settings_changed", f"{admin.name} updated priority {p.name}", user=admin)
    db.commit()
    return PriorityOut.model_validate(p)


@router.delete("/priorities/{priority_id}")
def delete_priority(priority_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(Priority, priority_id)
    if not p:
        raise HTTPException(404, "Priority not found")
    db.execute(update(Lead).where(Lead.priority_id == p.id).values(priority_id=None))
    log_activity(db, "settings_changed", f"{admin.name} deleted priority {p.name}", user=admin)
    db.delete(p)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ tags

@router.post("/tags", status_code=201)
def create_tag(body: TagIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Any user who can edit leads may create tags on the fly.
    if not (user.is_admin or user.can("leads.edit")):
        raise HTTPException(403, "You don't have permission to create tags")
    existing = db.scalar(select(Tag).where(func.lower(Tag.name) == body.name.strip().lower()))
    if existing:
        return TagOut.model_validate(existing)
    t = Tag(name=body.name.strip(), color=body.color)
    db.add(t)
    db.commit()
    return TagOut.model_validate(t)


@router.patch("/tags/{tag_id}")
def update_tag(tag_id: int, body: TagIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    t = db.get(Tag, tag_id)
    if not t:
        raise HTTPException(404, "Tag not found")
    clash = db.scalar(select(Tag).where(func.lower(Tag.name) == body.name.strip().lower(), Tag.id != t.id))
    if clash:
        raise HTTPException(400, "A tag with this name already exists")
    t.name, t.color = body.name.strip(), body.color
    db.commit()
    return TagOut.model_validate(t)


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    t = db.get(Tag, tag_id)
    if not t:
        raise HTTPException(404, "Tag not found")
    log_activity(db, "settings_changed", f"{admin.name} deleted tag {t.name}", user=admin)
    db.delete(t)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ custom fields

def _validate_field(body: CustomFieldIn) -> list[str]:
    if body.field_type not in CUSTOM_FIELD_TYPES:
        raise HTTPException(400, f"Unsupported field type. Use one of: {', '.join(CUSTOM_FIELD_TYPES)}")
    options = [o.strip() for o in body.options if o and o.strip()]
    if body.field_type in ("dropdown", "multiselect") and not options:
        raise HTTPException(400, "Dropdown and multi-select fields need at least one option")
    return list(dict.fromkeys(options))


@router.post("/custom-fields", status_code=201)
def create_field(body: CustomFieldIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    options = _validate_field(body)
    key = _unique_key(db, CustomField, slugify(body.key or body.name))
    f = CustomField(name=body.name, key=key, field_type=body.field_type, options=options, required=body.required,
                    show_in_list=body.show_in_list, is_active=body.is_active, placeholder=body.placeholder,
                    order=_next_order(db, CustomField))
    db.add(f)
    log_activity(db, "settings_changed", f"{admin.name} added custom field {f.name} ({f.field_type})", user=admin)
    db.commit()
    return CustomFieldOut.model_validate(f)


@router.put("/custom-fields/reorder")
def reorder_fields(body: ReorderIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _reorder(db, CustomField, body.ids)
    db.commit()
    return {"ok": True}


@router.patch("/custom-fields/{field_id}")
def update_field(field_id: int, body: CustomFieldIn, admin: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    f = db.get(CustomField, field_id)
    if not f:
        raise HTTPException(404, "Field not found")
    options = _validate_field(body)
    f.name, f.field_type, f.options = body.name, body.field_type, options
    f.required, f.show_in_list, f.is_active, f.placeholder = (
        body.required, body.show_in_list, body.is_active, body.placeholder)
    log_activity(db, "settings_changed", f"{admin.name} updated custom field {f.name}", user=admin)
    db.commit()
    return CustomFieldOut.model_validate(f)


@router.delete("/custom-fields/{field_id}")
def delete_field(field_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    f = db.get(CustomField, field_id)
    if not f:
        raise HTTPException(404, "Field not found")
    log_activity(db, "settings_changed", f"{admin.name} deleted custom field {f.name}", user=admin)
    db.delete(f)
    db.commit()
    return {"ok": True}
