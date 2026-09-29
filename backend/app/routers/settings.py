import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import LeadSource, User
from ..security import client_ip, require_admin
from ..services import log_activity
from ..settings_store import DEFAULTS, ensure_api_key, get_setting, set_setting

router = APIRouter(prefix="/api/settings", tags=["settings"])

MODES = {"round_robin", "least_loaded", "specific", "rules", "shared"}
MODE_LABELS = {
    "round_robin": "Round robin", "least_loaded": "Least loaded", "specific": "Single manager",
    "rules": "Source-based rules", "shared": "Shared pool",
}


@router.get("")
def all_settings(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ensure_api_key(db)
    return {key: get_setting(db, key) for key in DEFAULTS}


def _validate_assignment(db: Session, value: dict) -> dict:
    if "mode" in value and value["mode"] not in MODES:
        raise HTTPException(400, "Unknown assignment mode")
    if "fallback" in value and value["fallback"] not in ("round_robin", "least_loaded", "manual"):
        raise HTTPException(400, "Unknown fallback mode")
    if "manager_ids" in value:
        value["manager_ids"] = [int(i) for i in value["manager_ids"] or [] if db.get(User, int(i))]
    if value.get("mode") == "specific":
        uid = value.get("specific_user_id") or get_setting(db, "assignment").get("specific_user_id")
        user = db.get(User, uid) if uid else None
        if not user or not user.is_active:
            raise HTTPException(400, "Choose an active user for single-manager mode")
    if "rules" in value:
        rules = []
        for r in value["rules"] or []:
            sid = r.get("source_id")
            uids = [int(u) for u in r.get("user_ids") or [] if db.get(User, int(u))]
            if sid and db.get(LeadSource, sid) and uids:
                rules.append({"source_id": sid, "user_ids": uids})
        value["rules"] = rules
    value.pop("rr_pointer", None)
    return value


@router.patch("/{key}")
def update_settings(key: str, value: dict, request: Request, admin: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    if key not in DEFAULTS:
        raise HTTPException(404, "Unknown settings group")
    value = {k: v for k, v in value.items() if k in DEFAULTS[key]}
    if key == "assignment":
        value = _validate_assignment(db, value)
    if key == "integration":
        value.pop("api_key", None)  # only via regenerate
    if key == "messaging":
        if "country_code" in value:
            value["country_code"] = "".join(c for c in str(value["country_code"]) if c.isdigit())[:4]
        if "templates" in value:
            value["templates"] = [
                {"name": str(t.get("name", "")).strip()[:60], "text": str(t.get("text", "")).strip()[:1000]}
                for t in value["templates"] or [] if isinstance(t, dict) and t.get("name") and t.get("text")
            ]
    if key == "security":
        if "session_hours" in value:
            value["session_hours"] = max(1, min(int(value["session_hours"]), 720))
        if "password_min_length" in value:
            value["password_min_length"] = max(6, min(int(value["password_min_length"]), 64))
    before = get_setting(db, key)
    merged = set_setting(db, key, value, commit=False)
    changed = [k for k in value if before.get(k) != merged.get(k)]
    if changed:
        desc = f"{admin.name} updated {key} settings: {', '.join(changed)}"
        if key == "assignment" and ("mode" in changed or "auto_assign" in changed):
            desc = (f"{admin.name} set lead assignment to "
                    + (MODE_LABELS[merged['mode']] if merged.get("auto_assign") else "Manual (auto-assign off)"))
        log_activity(db, "settings_changed", desc, user=admin, ip=client_ip(request),
                     meta={"group": key, "changed": changed})
    db.commit()
    return merged


@router.post("/integration/regenerate-key")
def regenerate_key(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    key = "crm_" + secrets.token_urlsafe(24)
    set_setting(db, "integration", {"api_key": key}, commit=False)
    log_activity(db, "settings_changed", f"{admin.name} regenerated the website API key", user=admin,
                 ip=client_ip(request))
    db.commit()
    return {"api_key": key}
