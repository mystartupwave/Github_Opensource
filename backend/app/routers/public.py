"""Website-form / external API intake. Authenticated by the integration API key."""

import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..lead_core import create_lead, default_status, find_duplicate, source_by_text, tags_by_names
from ..models import CustomField, LeadNote, Priority, utcnow
from ..schemas import PublicLeadIn
from ..security import client_ip
from ..services import log_activity, manager_pref, notify, notify_admins
from ..settings_store import get_setting

router = APIRouter(prefix="/api/public", tags=["public"])


def _check_key(request: Request, payload: dict, db: Session) -> None:
    integ = get_setting(db, "integration")
    if not integ.get("enabled", True):
        raise HTTPException(403, "Lead intake API is disabled")
    supplied = (request.headers.get("x-api-key") or request.query_params.get("api_key")
                or payload.pop("api_key", None) or "")
    expected = integ.get("api_key") or ""
    if not expected or not hmac.compare_digest(str(supplied), expected):
        raise HTTPException(401, "Invalid or missing API key (send it as the X-API-Key header)")


async def _read_payload(request: Request) -> tuple[dict, bool]:
    ctype = request.headers.get("content-type", "")
    if "application/json" in ctype:
        try:
            data = await request.json()
        except ValueError:
            raise HTTPException(400, "Invalid JSON body")
        if not isinstance(data, dict):
            raise HTTPException(400, "JSON body must be an object")
        return data, False
    form = await request.form()
    data: dict = {}
    for k in form.keys():
        vals = form.getlist(k)
        data[k] = vals if len(vals) > 1 else vals[0]
    return data, True


async def ingest_public_lead(request: Request, db: Session):
    payload, is_form = await _read_payload(request)
    _check_key(request, payload, db)
    redirect = payload.pop("_redirect", None)
    # Accept common alternative field names from form builders.
    for alias, key in (("full_name", "name"), ("mobile", "phone"), ("phone_number", "phone"),
                       ("company_name", "company"), ("utm_source", "source"), ("comments", "message")):
        if alias in payload and not payload.get(key):
            payload[key] = payload.pop(alias)
    try:
        body = PublicLeadIn.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False))
    if not (body.phone or body.email):
        raise HTTPException(422, "Provide at least a phone number or an email")

    # Custom fields can be sent inside "custom" or as top-level keys matching the field key.
    field_keys = {f.key for f in db.scalars(select(CustomField))}
    custom = dict(body.custom or {})
    for k, v in (body.model_extra or {}).items():
        if k in field_keys:
            custom[k] = v

    ip = client_ip(request)
    integ = get_setting(db, "integration")
    lead_cfg = get_setting(db, "leads")

    dup = find_duplicate(db, body.phone, body.email) if lead_cfg.get("dedupe_enabled", True) else None
    if dup:
        dup.enquiry_count += 1
        dup.updated_at = utcnow()
        src = source_by_text(db, body.source)
        text = f"Repeat enquiry #{dup.enquiry_count}" + (f" via {src.name}" if src else "")
        if body.message:
            db.add(LeadNote(lead_id=dup.id, user_id=None, content=f"{text}: {body.message}"))
        if dup.status and dup.status.category == "lost" and lead_cfg.get("dedupe_reopen_lost", True):
            st = default_status(db)
            if st:
                dup.status_id = st.id
                dup.status_changed_at = utcnow()
                text += f" — reopened as {st.name}"
        if body.tags:
            existing = {t.id for t in dup.tags}
            dup.tags = dup.tags + [t for t in tags_by_names(db, body.tags) if t.id not in existing]
        log_activity(db, "enquiry_repeat", text, lead=dup, ip=ip,
                     meta={"message": body.message, "source": src.name if src else None})
        if manager_pref(db, "manager_lead_updated"):
            notify(db, dup.assigned_to_id, "repeat_enquiry", f"{dup.name} enquired again", body.message, dup)
        notify_admins(db, "admin_new_lead", "repeat_enquiry", f"Repeat enquiry: {dup.name}",
                      f"Enquiry #{dup.enquiry_count}", dup)
        db.commit()
        result = {"ok": True, "lead_id": dup.id, "code": dup.code, "duplicate": True}
    else:
        src = source_by_text(db, body.source or integ.get("default_source_key") or "website")
        pr = None
        if body.priority:
            pr = db.scalar(select(Priority).where(func.lower(Priority.name) == body.priority.lower()))
        lead = create_lead(
            db, actor=None, via="api", ip=ip, strict_custom=False, custom=custom,
            tags=tags_by_names(db, body.tags),
            data={"name": body.name, "phone": body.phone, "email": body.email, "company": body.company,
                  "message": body.message, "source_id": src.id if src else None,
                  "priority_id": pr.id if pr else None},
        )
        db.commit()
        result = {"ok": True, "lead_id": lead.id, "code": lead.code, "duplicate": False,
                  "assigned_to": lead.assigned_to.name if lead.assigned_to else None}

    if is_form and redirect and str(redirect).startswith(("http://", "https://", "/")):
        return RedirectResponse(str(redirect), status_code=303)
    return result


@router.post("/leads", status_code=201)
async def public_create_lead(request: Request, db: Session = Depends(get_db)):
    return await ingest_public_lead(request, db)
