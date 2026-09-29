import csv
import json
import io
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import String, and_, cast, exists, false, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..lead_core import (
    apply_custom,
    assign_lead,
    change_status,
    create_lead,
    fields_map,
    lead_out,
    phone_digits,
    source_by_text,
    tags_by_names,
)
from ..models import (
    Activity,
    CustomField,
    CustomFieldValue,
    Lead,
    LeadFollowup,
    LeadNote,
    LeadSource,
    LeadStatus,
    Priority,
    Tag,
    User,
    lead_tag_relations,
    utcnow,
)
from ..schemas import (
    ActivityOut,
    AssignIn,
    BulkAction,
    FollowupIn,
    FollowupOut,
    LeadIn,
    LeadUpdate,
    NoteIn,
    NoteOut,
    StatusMove,
    to_naive_utc,
)
from ..security import client_ip, get_current_user, get_optional_user, require_perm
from ..services import (
    can_see_lead,
    day_bounds,
    is_shared_mode,
    lead_visibility,
    log_activity,
    manager_pref,
    notify,
    recompute_next_followup,
)
from .public import ingest_public_lead

router = APIRouter(prefix="/api/leads", tags=["leads"])


# ------------------------------------------------------------------ filtering

def _ids(value: str | None) -> list[int]:
    if not value:
        return []
    return [int(x) for x in value.split(",") if x.strip().isdigit()]


def _local_date_to_utc(d: str, offset: int, end: bool = False) -> datetime | None:
    try:
        day = date.fromisoformat(d)
    except ValueError:
        return None
    dt = datetime(day.year, day.month, day.day) - timedelta(minutes=offset)
    return dt + timedelta(days=1) if end else dt


class LeadFilters:
    def __init__(
        self,
        request: Request,
        q: str | None = None,
        status: str | None = None,
        category: str | None = Query(None, pattern="^(open|won|lost)$"),
        assigned_to: str | None = None,
        source: str | None = None,
        priority: str | None = None,
        tag: str | None = None,
        created_from: str | None = None,
        created_to: str | None = None,
        followup: str | None = Query(None, pattern="^(overdue|today|tomorrow|upcoming|none|any)$"),
        tz_offset: int = 0,
    ):
        self.q, self.status, self.category, self.assigned_to = q, status, category, assigned_to
        self.source, self.priority, self.tag = source, priority, tag
        self.created_from, self.created_to, self.followup, self.tz_offset = created_from, created_to, followup, tz_offset
        # custom field filters: ?cf.budget=₹10k–₹25k
        self.custom = {k[3:]: v for k, v in request.query_params.items() if k.startswith("cf.") and v}

    def conditions(self, db: Session, user: User, include_status: bool = True) -> list:
        conds = [Lead.is_deleted == false(), lead_visibility(db, user)]
        if self.q and self.q.strip():
            q = self.q.strip()
            like = f"%{q}%"
            ors = [Lead.name.ilike(like), Lead.email.ilike(like), Lead.company.ilike(like), Lead.phone.ilike(like)]
            m = re.fullmatch(r"(?i)(?:ld-?)?(\d{5,})", q)
            if m and q.lower().startswith("ld"):
                ors.append(Lead.id == int(m.group(1)) - 10000)
            digits = re.sub(r"\D", "", q)
            if len(digits) >= 4:
                ors.append(Lead.phone_digits.like(f"%{digits[-10:]}%"))
            conds.append(or_(*ors))
        if include_status and self.status:
            conds.append(Lead.status_id.in_(_ids(self.status)))
        if self.category:
            conds.append(Lead.status_id.in_(select(LeadStatus.id).where(LeadStatus.category == self.category)))
        if self.assigned_to:
            parts = self.assigned_to.split(",")
            ors = []
            if "unassigned" in parts:
                ors.append(Lead.assigned_to_id.is_(None))
            if "me" in parts:
                ors.append(Lead.assigned_to_id == user.id)
            ids = [int(p) for p in parts if p.isdigit()]
            if ids:
                ors.append(Lead.assigned_to_id.in_(ids))
            if ors:
                conds.append(or_(*ors))
        if self.source:
            conds.append(Lead.source_id.in_(_ids(self.source)))
        if self.priority:
            conds.append(Lead.priority_id.in_(_ids(self.priority)))
        if self.tag:
            conds.append(exists().where(lead_tag_relations.c.lead_id == Lead.id,
                                        lead_tag_relations.c.tag_id.in_(_ids(self.tag))))
        if self.created_from and (dt := _local_date_to_utc(self.created_from, self.tz_offset)):
            conds.append(Lead.created_at >= dt)
        if self.created_to and (dt := _local_date_to_utc(self.created_to, self.tz_offset, end=True)):
            conds.append(Lead.created_at < dt)
        if self.followup:
            now = utcnow()
            today, tomorrow, day_after = day_bounds(now, self.tz_offset)
            f = Lead.next_followup_at
            conds.append({
                "overdue": and_(f.is_not(None), f < now),
                "today": and_(f >= now, f < tomorrow),
                "tomorrow": and_(f >= tomorrow, f < day_after),
                "upcoming": f >= now,
                "none": f.is_(None),
                "any": f.is_not(None),
            }[self.followup])
        if self.custom:
            fields = {f.key: f for f in db.scalars(select(CustomField).where(CustomField.key.in_(self.custom)))}
            for key, val in self.custom.items():
                field = fields.get(key)
                if not field:
                    continue
                # Values are stored as JSON text with non-ASCII escaped, so compare against json.dumps().
                raw = cast(CustomFieldValue.value, String)
                if field.field_type == "dropdown":
                    match = raw == json.dumps(val)
                elif field.field_type == "multiselect":
                    match = raw.like(f"%{json.dumps(val)}%")
                elif field.field_type == "checkbox":
                    match = raw == ("true" if val in ("1", "true", "yes") else "false")
                else:
                    match = cast(func.json_extract(CustomFieldValue.value, "$"), String).ilike(f"%{val}%")
                conds.append(exists().where(CustomFieldValue.lead_id == Lead.id,
                                            CustomFieldValue.field_id == field.id, match))
        return conds


SORTS = {
    "created_desc": Lead.created_at.desc(),
    "created_asc": Lead.created_at.asc(),
    "updated_desc": Lead.updated_at.desc(),
    "name_asc": Lead.name.asc(),
    "followup_asc": func.coalesce(Lead.next_followup_at, datetime(9999, 1, 1)).asc(),
    "contact_desc": func.coalesce(Lead.last_contact_at, datetime(1970, 1, 1)).desc(),
    "enquiries_desc": Lead.enquiry_count.desc(),
}


def _get_visible_lead(db: Session, user: User, lead_id: int) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead or not can_see_lead(db, user, lead):
        raise HTTPException(404, "Lead not found")
    return lead


# ------------------------------------------------------------------ list / pipeline / export

@router.get("")
def list_leads(
    filters: LeadFilters = Depends(),
    sort: str = "created_desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conds = filters.conditions(db, user)
    total = db.scalar(select(func.count(Lead.id)).where(*conds))
    rows = db.scalars(
        select(Lead).where(*conds).order_by(SORTS.get(sort, SORTS["created_desc"]), Lead.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    ).unique().all()
    fields = fields_map(db)
    return {"items": [lead_out(l, fields) for l in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/pipeline")
def pipeline(
    filters: LeadFilters = Depends(),
    per_column: int = Query(100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statuses = db.scalars(select(LeadStatus).where(LeadStatus.show_in_pipeline.is_(True))
                          .order_by(LeadStatus.order)).all()
    conds = filters.conditions(db, user, include_status=False)
    counts = dict(db.execute(select(Lead.status_id, func.count(Lead.id)).where(*conds)
                             .group_by(Lead.status_id)).all())
    fields = fields_map(db)
    columns = []
    for st in statuses:
        leads = db.scalars(
            select(Lead).where(*conds, Lead.status_id == st.id)
            .order_by(func.coalesce(Lead.status_changed_at, Lead.created_at).desc()).limit(per_column)
        ).unique().all()
        columns.append({"status": {"id": st.id, "name": st.name, "color": st.color, "category": st.category},
                        "count": counts.get(st.id, 0), "leads": [lead_out(l, fields) for l in leads]})
    return {"columns": columns}


@router.get("/export")
def export_leads(
    filters: LeadFilters = Depends(),
    user: User = Depends(require_perm("leads.export")),
    db: Session = Depends(get_db),
):
    conds = filters.conditions(db, user)
    leads = db.scalars(select(Lead).where(*conds).order_by(Lead.created_at.desc())).unique().all()
    fields = [f for f in db.scalars(select(CustomField).order_by(CustomField.order))]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Lead ID", "Name", "Phone", "Email", "Company", "Source", "Status", "Priority", "Assigned To",
                "Tags", "Enquiries", "Created At", "Last Contact", "Next Follow-up", "Message", "Notes"]
               + [f.name for f in fields])
    fmt = lambda d: d.strftime("%Y-%m-%d %H:%M") if d else ""
    for l in leads:
        cv = {v.field_id: v.value for v in l.custom_values}
        w.writerow([
            l.code, l.name, l.phone or "", l.email or "", l.company or "",
            l.source.name if l.source else "", l.status.name if l.status else "",
            l.priority.name if l.priority else "", l.assigned_to.name if l.assigned_to else "",
            ", ".join(t.name for t in l.tags), l.enquiry_count, fmt(l.created_at), fmt(l.last_contact_at),
            fmt(l.next_followup_at), l.message or "", l.notes or "",
        ] + [", ".join(cv[f.id]) if isinstance(cv.get(f.id), list) else cv.get(f.id, "") for f in fields])
    log_activity(db, "leads_exported", f"{user.name} exported {len(leads)} leads to CSV", user=user)
    db.commit()
    return StreamingResponse(
        iter(["﻿" + buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="leads-{date.today().isoformat()}.csv"'},
    )


@router.post("/import")
async def import_leads(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_perm("leads.import")),
    db: Session = Depends(get_db),
):
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(raw))
    norm = lambda s: re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")
    statuses = {s.name.lower(): s for s in db.scalars(select(LeadStatus))}
    priorities = {p.name.lower(): p for p in db.scalars(select(Priority))}
    users = {u.email.lower(): u for u in db.scalars(select(User))}
    users_by_name = {u.name.lower(): u for u in users.values()}
    field_keys = {f.key for f in db.scalars(select(CustomField))}
    field_names = {norm(f.name): f.key for f in db.scalars(select(CustomField))}
    created, errors = 0, []
    for i, row in enumerate(reader, start=2):
        r = {norm(k): (v or "").strip() for k, v in row.items() if k}
        name = r.get("name") or r.get("lead_name") or r.get("full_name")
        if not name:
            errors.append(f"Row {i}: name is required")
            continue
        try:
            with db.begin_nested():
                src = source_by_text(db, r.get("source"))
                st = statuses.get((r.get("status") or "").lower())
                pr = priorities.get((r.get("priority") or "").lower())
                who = (r.get("assigned_to") or "").lower()
                assignee = users.get(who) or users_by_name.get(who)
                if not user.can("leads.assign") and not user.is_admin:
                    assignee = None
                custom = {}
                for k, v in r.items():
                    if k in field_keys:
                        custom[k] = v
                    elif k in field_names:
                        custom[field_names[k]] = v
                create_lead(
                    db, actor=user, via="import", ip=client_ip(request),
                    data={"name": name, "phone": r.get("phone") or r.get("mobile"), "email": r.get("email"),
                          "company": r.get("company"), "message": r.get("message"), "notes": r.get("notes"),
                          "source_id": src.id if src else None, "status_id": st.id if st else None,
                          "priority_id": pr.id if pr else None,
                          "assigned_to_id": assignee.id if assignee else None},
                    tags=tags_by_names(db, r.get("tags")), custom=custom, strict_custom=False,
                )
                created += 1
        except HTTPException as e:
            errors.append(f"Row {i}: {e.detail}")
    log_activity(db, "leads_imported", f"{user.name} imported {created} leads from CSV", user=user,
                 meta={"errors": len(errors)})
    db.commit()
    return {"created": created, "errors": errors[:50]}


# ------------------------------------------------------------------ create

@router.post("", status_code=201)
async def create_lead_endpoint(request: Request, user: User | None = Depends(get_optional_user),
                               db: Session = Depends(get_db)):
    # Website forms may POST here with an X-API-Key header instead of a user session.
    if user is None:
        return await ingest_public_lead(request, db)
    if not user.can("leads.create"):
        raise HTTPException(403, "You don't have permission to create leads")
    body = LeadIn.model_validate(await request.json())
    data = body.model_dump(exclude={"tag_ids", "custom"})
    data["last_contact_at"] = to_naive_utc(body.last_contact_at)
    if not user.can("leads.assign"):
        data["assigned_to_id"] = None
    elif data.get("assigned_to_id") and not db.get(User, data["assigned_to_id"]):
        raise HTTPException(400, "Assignee not found")
    tags = list(db.scalars(select(Tag).where(Tag.id.in_(body.tag_ids)))) if body.tag_ids else []
    lead = create_lead(db, data=data, actor=user, via="ui", tags=tags, custom=body.custom, ip=client_ip(request))
    db.commit()
    db.refresh(lead)
    return lead_out(lead, fields_map(db))


# ------------------------------------------------------------------ detail / update / delete

@router.get("/{lead_id}")
def get_lead(lead_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    notes = db.scalars(select(LeadNote).where(LeadNote.lead_id == lead.id).order_by(LeadNote.created_at.desc())).all()
    followups = db.scalars(select(LeadFollowup).where(LeadFollowup.lead_id == lead.id)
                           .order_by(LeadFollowup.status != "pending", LeadFollowup.due_at)).all()
    acts = db.scalars(select(Activity).where(Activity.lead_id == lead.id).order_by(Activity.created_at.desc(),
                                                                                  Activity.id.desc())).all()
    return {
        "lead": lead_out(lead, fields_map(db)),
        "notes": [NoteOut.model_validate(n).model_dump(mode="json") for n in notes],
        "followups": [FollowupOut.model_validate(f).model_dump(mode="json", exclude={"lead"}) for f in followups],
        "activities": [ActivityOut.model_validate(a).model_dump(mode="json") for a in acts],
    }


EDITABLE = {"name": "name", "phone": "phone", "email": "email", "company": "company", "message": "message",
            "notes": "notes", "last_contact_at": "last contact"}


@router.patch("/{lead_id}")
def update_lead(lead_id: int, body: LeadUpdate, request: Request, user: User = Depends(require_perm("leads.edit")),
                db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    data = body.model_dump(exclude_unset=True)
    ip = client_ip(request)
    changed: list[str] = []
    diff: dict = {}

    for key, label in EDITABLE.items():
        if key not in data:
            continue
        val = data[key]
        if key == "last_contact_at":
            val = to_naive_utc(val)
        elif isinstance(val, str):
            val = val.strip() or None
            if key == "email" and val:
                val = val.lower()
        if key == "name" and not val:
            raise HTTPException(400, "Name is required")
        if getattr(lead, key) != val:
            diff[key] = [str(getattr(lead, key) or ""), str(val or "")]
            setattr(lead, key, val)
            changed.append(label)
            if key == "phone":
                lead.phone_digits = phone_digits(val)

    if "source_id" in data and data["source_id"] != lead.source_id:
        src = db.get(LeadSource, data["source_id"]) if data["source_id"] else None
        diff["source"] = [lead.source.name if lead.source else "", src.name if src else ""]
        lead.source_id = src.id if src else None
        changed.append("source")

    if "priority_id" in data and data["priority_id"] != lead.priority_id:
        pr = db.get(Priority, data["priority_id"]) if data["priority_id"] else None
        old = lead.priority.name if lead.priority else "—"
        lead.priority_id = pr.id if pr else None
        log_activity(db, "priority_changed", f"{user.name} changed priority of {lead.name}: {old} → {pr.name if pr else '—'}",
                     user=user, lead=lead, ip=ip,
                     meta={"from": old, "to": pr.name if pr else None, "color": pr.color if pr else None})

    if body.tag_ids is not None:
        new_tags = list(db.scalars(select(Tag).where(Tag.id.in_(body.tag_ids)))) if body.tag_ids else []
        if {t.id for t in new_tags} != {t.id for t in lead.tags}:
            added = [t.name for t in new_tags if t not in lead.tags]
            removed = [t.name for t in lead.tags if t not in new_tags]
            lead.tags = new_tags
            parts = ([f"added {', '.join(added)}"] if added else []) + ([f"removed {', '.join(removed)}"] if removed else [])
            log_activity(db, "tags_changed", f"{user.name} {' and '.join(parts)} tag(s)", user=user, lead=lead, ip=ip)

    if body.custom is not None:
        changed += apply_custom(db, lead, body.custom)

    if changed:
        log_activity(db, "lead_edited", f"{user.name} edited {lead.name}: {', '.join(changed)}", user=user, lead=lead,
                     ip=ip, meta={"fields": changed, "diff": diff})
        if manager_pref(db, "manager_lead_updated"):
            notify(db, lead.assigned_to_id, "lead_updated", f"{lead.name} was updated",
                   f"{user.name} edited {', '.join(changed)}", lead, user)

    if "status_id" in data and data["status_id"]:
        st = db.get(LeadStatus, data["status_id"])
        if not st:
            raise HTTPException(400, "Status not found")
        change_status(db, lead, st, user, ip)

    if "assigned_to_id" in data:
        if not user.can("leads.assign"):
            if data["assigned_to_id"] != lead.assigned_to_id:
                raise HTTPException(403, "You don't have permission to reassign leads")
        else:
            target = db.get(User, data["assigned_to_id"]) if data["assigned_to_id"] else None
            if data["assigned_to_id"] and (not target or not target.is_active):
                raise HTTPException(400, "Assignee not found or inactive")
            assign_lead(db, lead, target, user, ip)

    lead.updated_at = utcnow()
    db.commit()
    db.refresh(lead)
    return lead_out(lead, fields_map(db))


@router.delete("/{lead_id}")
def delete_lead(lead_id: int, request: Request, user: User = Depends(require_perm("leads.delete")),
                db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    lead.is_deleted = True
    log_activity(db, "lead_deleted", f"{user.name} deleted lead {lead.name} ({lead.code})", user=user, lead=lead,
                 ip=client_ip(request))
    db.commit()
    return {"ok": True}


@router.post("/{lead_id}/move")
def move_lead(lead_id: int, body: StatusMove, request: Request, user: User = Depends(require_perm("leads.edit")),
              db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    st = db.get(LeadStatus, body.status_id)
    if not st:
        raise HTTPException(400, "Status not found")
    if change_status(db, lead, st, user, client_ip(request)):
        lead.updated_at = utcnow()
    db.commit()
    db.refresh(lead)
    return lead_out(lead, fields_map(db))


@router.post("/{lead_id}/assign")
def assign(lead_id: int, body: AssignIn, request: Request, user: User = Depends(require_perm("leads.assign")),
           db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    target = db.get(User, body.assigned_to_id) if body.assigned_to_id else None
    if body.assigned_to_id and (not target or not target.is_active):
        raise HTTPException(400, "Assignee not found or inactive")
    assign_lead(db, lead, target, user, client_ip(request))
    db.commit()
    db.refresh(lead)
    return lead_out(lead, fields_map(db))


@router.post("/{lead_id}/claim")
def claim(lead_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Shared-pool mode: a manager takes ownership of an unassigned lead."""
    lead = _get_visible_lead(db, user, lead_id)
    if lead.assigned_to_id:
        raise HTTPException(409, f"Already claimed by {lead.assigned_to.name}")
    if not is_shared_mode(db) and not user.can("leads.assign"):
        raise HTTPException(403, "Claiming is only available in shared-pool mode")
    assign_lead(db, lead, user, user, client_ip(request), reason="claimed from shared pool")
    db.commit()
    db.refresh(lead)
    return lead_out(lead, fields_map(db))


@router.post("/bulk")
def bulk(body: BulkAction, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    need = {"assign": "leads.assign", "delete": "leads.delete"}.get(body.action, "leads.edit")
    if not user.can(need):
        raise HTTPException(403, "You don't have permission for this action")
    ip = client_ip(request)
    leads = [l for l in db.scalars(select(Lead).where(Lead.id.in_(body.lead_ids))).unique().all()
             if can_see_lead(db, user, l)]
    affected = 0
    if body.action == "assign":
        target = db.get(User, body.assigned_to_id) if body.assigned_to_id else None
        if body.assigned_to_id and (not target or not target.is_active):
            raise HTTPException(400, "Assignee not found or inactive")
        affected = sum(assign_lead(db, l, target, user, ip, reason="bulk") for l in leads)
    elif body.action == "status":
        st = db.get(LeadStatus, body.status_id or 0)
        if not st:
            raise HTTPException(400, "Status not found")
        affected = sum(change_status(db, l, st, user, ip) for l in leads)
    elif body.action == "priority":
        pr = db.get(Priority, body.priority_id or 0)
        if not pr:
            raise HTTPException(400, "Priority not found")
        for l in leads:
            if l.priority_id != pr.id:
                l.priority_id = pr.id
                log_activity(db, "priority_changed", f"{user.name} set priority of {l.name} to {pr.name} (bulk)",
                             user=user, lead=l, ip=ip, meta={"to": pr.name, "color": pr.color})
                affected += 1
    elif body.action in ("add_tags", "remove_tags"):
        tags = list(db.scalars(select(Tag).where(Tag.id.in_(body.tag_ids))))
        for l in leads:
            before = {t.id for t in l.tags}
            if body.action == "add_tags":
                l.tags = l.tags + [t for t in tags if t.id not in before]
            else:
                l.tags = [t for t in l.tags if t.id not in {x.id for x in tags}]
            if {t.id for t in l.tags} != before:
                affected += 1
                log_activity(db, "tags_changed", f"{user.name} {'added' if body.action == 'add_tags' else 'removed'} "
                             f"tag(s) {', '.join(t.name for t in tags)} (bulk)", user=user, lead=l, ip=ip)
    elif body.action == "delete":
        for l in leads:
            l.is_deleted = True
            log_activity(db, "lead_deleted", f"{user.name} deleted lead {l.name} ({l.code}) (bulk)", user=user, lead=l,
                         ip=ip)
        affected = len(leads)
    db.commit()
    return {"affected": affected, "total": len(leads)}


# ------------------------------------------------------------------ notes / contact / follow-ups

@router.post("/{lead_id}/notes", status_code=201)
def add_note(lead_id: int, body: NoteIn, request: Request, user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    note = LeadNote(lead_id=lead.id, user_id=user.id, content=body.content.strip())
    db.add(note)
    lead.updated_at = utcnow()
    log_activity(db, "note_added", f"{user.name} added a note", user=user, lead=lead, ip=client_ip(request),
                 meta={"content": note.content[:500]})
    if manager_pref(db, "manager_lead_updated"):
        notify(db, lead.assigned_to_id, "note_added", f"New note on {lead.name}", f"{user.name}: {note.content[:120]}",
               lead, user)
    db.commit()
    db.refresh(note)
    return NoteOut.model_validate(note).model_dump(mode="json")


@router.delete("/{lead_id}/notes/{note_id}")
def delete_note(lead_id: int, note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    note = db.get(LeadNote, note_id)
    if not note or note.lead_id != lead.id:
        raise HTTPException(404, "Note not found")
    if note.user_id != user.id and not user.is_admin:
        raise HTTPException(403, "You can only delete your own notes")
    log_activity(db, "note_deleted", f"{user.name} deleted a note", user=user, lead=lead,
                 meta={"content": note.content[:500]})
    db.delete(note)
    db.commit()
    return {"ok": True}


CHANNELS = {"call": "by phone", "whatsapp": "on WhatsApp", "email": "by email", "meeting": "in a meeting",
            "sms": "by SMS", "other": ""}


@router.post("/{lead_id}/contact")
def log_contact(lead_id: int, request: Request, body: dict, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Record a touchpoint (call, WhatsApp, email…). Updates Last Contact."""
    lead = _get_visible_lead(db, user, lead_id)
    channel = body.get("channel") if body.get("channel") in CHANNELS else "call"
    summary = (body.get("summary") or "").strip()
    lead.last_contact_at = utcnow()
    lead.updated_at = utcnow()
    log_activity(db, "contacted", f"{user.name} contacted {lead.name} {CHANNELS[channel]}".strip(), user=user,
                 lead=lead, ip=client_ip(request), meta={"channel": channel, "summary": summary or None})
    db.commit()
    db.refresh(lead)
    return lead_out(lead, fields_map(db))


@router.post("/{lead_id}/followups", status_code=201)
def add_followup(lead_id: int, body: FollowupIn, request: Request, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    lead = _get_visible_lead(db, user, lead_id)
    assignee_id = body.assigned_to_id or lead.assigned_to_id or user.id
    if assignee_id != user.id and assignee_id != lead.assigned_to_id and not user.can("leads.assign"):
        assignee_id = user.id
    f = LeadFollowup(lead_id=lead.id, assigned_to_id=assignee_id, created_by_id=user.id,
                     due_at=to_naive_utc(body.due_at), type=body.type or "call", note=body.note)
    db.add(f)
    recompute_next_followup(db, lead)
    lead.updated_at = utcnow()
    log_activity(db, "followup_created", f"{user.name} scheduled a {f.type} follow-up", user=user, lead=lead,
                 ip=client_ip(request), meta={"due_at": f.due_at.isoformat() + "Z", "note": f.note, "type": f.type})
    if assignee_id != user.id:
        notify(db, assignee_id, "followup_assigned", f"Follow-up scheduled: {lead.name}", body.note or f.type, lead, user)
    db.commit()
    db.refresh(f)
    return FollowupOut.model_validate(f).model_dump(mode="json")
