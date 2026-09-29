from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite has no tz support; API layer appends 'Z')."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# All permission keys a role can hold. Admin roles implicitly hold every one.
PERMISSIONS: dict[str, str] = {
    "leads.view_all": "View all leads (not only assigned ones)",
    "leads.create": "Create leads",
    "leads.edit": "Edit leads",
    "leads.delete": "Delete leads",
    "leads.assign": "Assign / reassign leads",
    "leads.export": "Export leads to CSV",
    "leads.import": "Import leads from CSV",
    "reports.view": "View reports & analytics",
    "activity.view_all": "View activity logs of all users",
}


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    description: Mapped[str | None] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    users: Mapped[list["User"]] = relationship(back_populates="role")

    def has(self, perm: str) -> bool:
        return self.is_admin or perm in (self.permissions or [])


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    role: Mapped[Role] = relationship(back_populates="users", lazy="joined")

    @property
    def is_admin(self) -> bool:
        return bool(self.role and self.role.is_admin)

    def can(self, perm: str) -> bool:
        return bool(self.role and self.role.has(perm))


class LeadStatus(Base):
    __tablename__ = "lead_statuses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(20), default="#64748b")
    order: Mapped[int] = mapped_column(Integer, default=0)
    # open = still in pipeline, won = converted, lost = dead
    category: Mapped[str] = mapped_column(String(10), default="open")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    show_in_pipeline: Mapped[bool] = mapped_column(Boolean, default=True)


class LeadSource(Base):
    __tablename__ = "lead_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    key: Mapped[str] = mapped_column(String(60), unique=True)
    color: Mapped[str] = mapped_column(String(20), default="#64748b")
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Priority(Base):
    __tablename__ = "priorities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    color: Mapped[str] = mapped_column(String(20), default="#64748b")
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    color: Mapped[str] = mapped_column(String(20), default="#64748b")


lead_tag_relations = Table(
    "lead_tag_relations",
    Base.metadata,
    Column("lead_id", ForeignKey("leads.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    phone: Mapped[str | None] = mapped_column(String(40), index=True)
    phone_digits: Mapped[str | None] = mapped_column(String(20), index=True)  # last 10 digits, for dedupe/search
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    company: Mapped[str | None] = mapped_column(String(160), index=True)
    message: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    source_id: Mapped[int | None] = mapped_column(ForeignKey("lead_sources.id", ondelete="SET NULL"), index=True)
    status_id: Mapped[int | None] = mapped_column(ForeignKey("lead_statuses.id", ondelete="SET NULL"), index=True)
    priority_id: Mapped[int | None] = mapped_column(ForeignKey("priorities.id", ondelete="SET NULL"), index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)

    enquiry_count: Mapped[int] = mapped_column(Integer, default=1)
    position: Mapped[float] = mapped_column(default=0)  # ordering inside a pipeline column

    last_contact_at: Mapped[datetime | None] = mapped_column(DateTime)
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime)
    converted_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    source: Mapped[LeadSource | None] = relationship(lazy="joined")
    status: Mapped[LeadStatus | None] = relationship(lazy="joined")
    priority: Mapped[Priority | None] = relationship(lazy="joined")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="joined")
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id], lazy="joined")
    tags: Mapped[list[Tag]] = relationship(secondary=lead_tag_relations, lazy="selectin")
    custom_values: Mapped[list["CustomFieldValue"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def code(self) -> str:
        return f"LD-{10000 + self.id}"


class LeadNote(Base):
    __tablename__ = "lead_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User | None] = relationship(lazy="joined")


class LeadFollowup(Base):
    __tablename__ = "lead_followups"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    due_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    type: Mapped[str] = mapped_column(String(20), default="call")  # call, meeting, email, whatsapp, other
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)  # pending, done, cancelled
    outcome: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    notified_due: Mapped[bool] = mapped_column(Boolean, default=False)
    notified_overdue: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    lead: Mapped[Lead] = relationship(lazy="joined")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="joined")


class Activity(Base):
    """Single audit trail: lead timeline entries (lead_id set) and system events."""

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column(JSON)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    user: Mapped[User | None] = relationship(lazy="joined")
    lead: Mapped[Lead | None] = relationship(lazy="joined")


CUSTOM_FIELD_TYPES = [
    "text", "number", "email", "phone", "date", "dropdown", "multiselect", "checkbox", "textarea", "currency",
]


class CustomField(Base):
    __tablename__ = "custom_fields"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    key: Mapped[str] = mapped_column(String(80), unique=True)
    field_type: Mapped[str] = mapped_column(String(20))
    options: Mapped[list] = mapped_column(JSON, default=list)
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    show_in_list: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    placeholder: Mapped[str | None] = mapped_column(String(160))


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"
    __table_args__ = (UniqueConstraint("lead_id", "field_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("custom_fields.id", ondelete="CASCADE"), index=True)
    value: Mapped[object] = mapped_column(JSON)

    lead: Mapped[Lead] = relationship(back_populates="custom_values")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[object] = mapped_column(JSON)
