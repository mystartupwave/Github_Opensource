"""Key/value app settings stored in the app_settings table, merged over defaults."""

import copy
import secrets

from sqlalchemy.orm import Session

from .models import AppSetting

DEFAULTS: dict[str, dict] = {
    "company": {
        "name": "My Company",
        "timezone": "Asia/Kolkata",
        "currency": "INR",
        "currency_symbol": "₹",
        "date_format": "DD MMM YYYY",
    },
    "assignment": {
        # Master toggle: when off, new leads stay unassigned for the admin to assign.
        "auto_assign": True,
        # round_robin | least_loaded | specific | rules | shared
        #   round_robin  – rotate through the manager pool
        #   least_loaded – give to the pool member with fewest open leads
        #   specific     – every lead goes to one chosen manager
        #   rules        – match lead source -> manager, fall back to `fallback`
        #   shared       – leave unassigned, visible to all managers, first to claim wins
        "mode": "round_robin",
        "manager_ids": [],  # pool; empty = all active non-admin users
        "specific_user_id": None,
        "rules": [],  # [{"source_id": 1, "user_ids": [2, 3]}]
        "fallback": "round_robin",  # round_robin | least_loaded | manual
        "apply_to_manual": False,  # also auto-assign leads created in the UI without an assignee
        "managers_self_assign": True,  # leads a manager creates are assigned to themselves
        "rr_pointer": 0,
    },
    "leads": {
        "dedupe_enabled": True,  # repeat enquiries (same phone/email) bump the existing lead
        "dedupe_reopen_lost": True,  # a repeat enquiry on a lost lead moves it back to default status
    },
    "notifications": {
        "admin_new_lead": True,
        "admin_new_user": True,
        "admin_status_change": False,
        "admin_conversion": True,
        "manager_assigned": True,
        "manager_lead_updated": True,
        "manager_followup_due": True,
        "manager_followup_overdue": True,
        "followup_reminder_minutes": 30,
    },
    "security": {
        "session_hours": 12,
        "password_min_length": 8,
    },
    "messaging": {
        # Prefixed to 10-digit numbers when opening WhatsApp / SMS links.
        "country_code": "91",
        # Placeholders: {name} {first_name} {lead_company} {manager} {company}
        "templates": [
            {"name": "Greeting", "text": "Hi {first_name}, this is {manager} from {company}. Thanks for your enquiry! When is a good time to talk?"},
            {"name": "Follow-up", "text": "Hi {first_name}, just following up on your enquiry with {company}. Do you have any questions I can help with?"},
            {"name": "Quotation sent", "text": "Hi {first_name}, I've shared the quotation for your requirement. Please have a look and let me know your thoughts."},
            {"name": "Missed call", "text": "Hi {first_name}, I tried calling you just now regarding your enquiry with {company}. Please let me know a convenient time to call back."},
            {"name": "Thank you", "text": "Hi {first_name}, thank you for choosing {company}! We're excited to work with you."},
        ],
    },
    "integration": {
        "api_key": "",
        "enabled": True,
        "allowed_origins": ["*"],
        "default_source_key": "website",
    },
}


def get_setting(db: Session, key: str) -> dict:
    base = copy.deepcopy(DEFAULTS.get(key, {}))
    row = db.get(AppSetting, key)
    if row and isinstance(row.value, dict):
        base.update(row.value)
    return base


def set_setting(db: Session, key: str, value: dict, commit: bool = True) -> dict:
    merged = get_setting(db, key)
    merged.update(value)
    row = db.get(AppSetting, key)
    if row:
        row.value = merged
    else:
        db.add(AppSetting(key=key, value=merged))
    if commit:
        db.commit()
    return merged


def ensure_api_key(db: Session) -> str:
    integ = get_setting(db, "integration")
    if not integ.get("api_key"):
        integ = set_setting(db, "integration", {"api_key": "crm_" + secrets.token_urlsafe(24)})
    return integ["api_key"]
