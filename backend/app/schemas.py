import re
from datetime import datetime, timezone
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer


def _ser_dt(d: datetime) -> str:
    if d.tzinfo is None:
        return d.isoformat() + "Z"
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(_ser_dt, return_type=str)]


def to_naive_utc(d: datetime | None) -> datetime | None:
    if d is None:
        return None
    if d.tzinfo is not None:
        d = d.astimezone(timezone.utc).replace(tzinfo=None)
    return d


def _email(v: str) -> str:
    v = v.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
        raise ValueError("Enter a valid email address")
    return v


EmailStr = Annotated[str, AfterValidator(_email)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ auth/users

class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RoleIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = None
    permissions: list[str] = []


class RoleOut(ORM):
    id: int
    name: str
    description: str | None
    is_admin: bool
    is_system: bool
    permissions: list[str]


class UserBrief(ORM):
    id: int
    name: str
    email: str


class UserOut(ORM):
    id: int
    name: str
    email: str
    phone: str | None
    role: RoleOut
    is_active: bool
    is_admin: bool
    last_login_at: UTCDateTime | None
    created_at: UTCDateTime


class MeOut(UserOut):
    permissions: list[str]


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str | None = None
    password: str
    role_id: int
    is_active: bool = True


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = None
    role_id: int | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    password: str


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ------------------------------------------------------------------ lookups

class StatusIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = "#64748b"
    category: str = Field(default="open", pattern="^(open|won|lost)$")
    is_default: bool = False
    show_in_pipeline: bool = True


class StatusOut(ORM):
    id: int
    name: str
    color: str
    order: int
    category: str
    is_default: bool
    show_in_pipeline: bool


class SourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    key: str | None = None
    color: str = "#64748b"
    is_active: bool = True


class SourceOut(ORM):
    id: int
    name: str
    key: str
    color: str
    order: int
    is_active: bool


class PriorityIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = "#64748b"
    is_default: bool = False


class PriorityOut(ORM):
    id: int
    name: str
    color: str
    order: int
    is_default: bool


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = "#64748b"


class TagOut(ORM):
    id: int
    name: str
    color: str


class ReorderIn(BaseModel):
    ids: list[int]


class CustomFieldIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    key: str | None = None
    field_type: str
    options: list[str] = []
    required: bool = False
    show_in_list: bool = False
    is_active: bool = True
    placeholder: str | None = None


class CustomFieldOut(ORM):
    id: int
    name: str
    key: str
    field_type: str
    options: list[str]
    required: bool
    show_in_list: bool
    is_active: bool
    order: int
    placeholder: str | None


# ------------------------------------------------------------------ leads

class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    message: str | None = None
    notes: str | None = None
    source_id: int | None = None
    status_id: int | None = None
    priority_id: int | None = None
    assigned_to_id: int | None = None
    tag_ids: list[int] = []
    custom: dict[str, Any] = {}
    last_contact_at: datetime | None = None


class LeadUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    message: str | None = None
    notes: str | None = None
    source_id: int | None = None
    status_id: int | None = None
    priority_id: int | None = None
    assigned_to_id: int | None = None
    tag_ids: list[int] | None = None
    custom: dict[str, Any] | None = None
    last_contact_at: datetime | None = None


class LeadOut(BaseModel):
    id: int
    code: str
    name: str
    phone: str | None
    email: str | None
    company: str | None
    message: str | None
    notes: str | None
    source: SourceOut | None
    status: StatusOut | None
    priority: PriorityOut | None
    assigned_to: UserBrief | None
    created_by: UserBrief | None
    tags: list[TagOut]
    custom: dict[str, Any]
    enquiry_count: int
    last_contact_at: UTCDateTime | None
    next_followup_at: UTCDateTime | None
    converted_at: UTCDateTime | None
    created_at: UTCDateTime
    updated_at: UTCDateTime


class LeadPage(BaseModel):
    items: list[LeadOut]
    total: int
    page: int
    page_size: int


class StatusMove(BaseModel):
    status_id: int
    position: float | None = None


class AssignIn(BaseModel):
    assigned_to_id: int | None


class BulkAction(BaseModel):
    lead_ids: list[int]
    action: str = Field(pattern="^(assign|status|priority|add_tags|remove_tags|delete)$")
    assigned_to_id: int | None = None
    status_id: int | None = None
    priority_id: int | None = None
    tag_ids: list[int] = []


class PublicLeadIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1, max_length=160)
    phone: str | None = None
    email: str | None = None
    company: str | None = None
    source: str | None = None
    message: str | None = None
    tags: list[str] | str | None = None
    priority: str | None = None
    custom: dict[str, Any] = {}


# ------------------------------------------------------------------ notes / followups / activity

class NoteIn(BaseModel):
    content: str = Field(min_length=1)


class NoteOut(ORM):
    id: int
    lead_id: int
    content: str
    user: UserBrief | None
    created_at: UTCDateTime


class FollowupIn(BaseModel):
    due_at: datetime
    type: str = "call"
    note: str | None = None
    assigned_to_id: int | None = None


class FollowupUpdate(BaseModel):
    due_at: datetime | None = None
    type: str | None = None
    note: str | None = None
    status: str | None = Field(default=None, pattern="^(pending|done|cancelled)$")
    outcome: str | None = None


class LeadMini(ORM):
    id: int
    code: str
    name: str
    phone: str | None
    company: str | None
    status: StatusOut | None


class FollowupOut(ORM):
    id: int
    lead_id: int
    lead: LeadMini | None = None
    assigned_to: UserBrief | None
    due_at: UTCDateTime
    type: str
    note: str | None
    status: str
    outcome: str | None
    completed_at: UTCDateTime | None
    created_at: UTCDateTime


class ActivityOut(ORM):
    id: int
    action: str
    description: str
    meta: dict | None
    ip: str | None
    user: UserBrief | None
    lead_id: int | None
    lead_name: str | None = None
    created_at: UTCDateTime


class ActivityPage(BaseModel):
    items: list[ActivityOut]
    total: int
    page: int
    page_size: int


class NotificationOut(ORM):
    id: int
    type: str
    title: str
    body: str | None
    lead_id: int | None
    is_read: bool
    created_at: UTCDateTime
