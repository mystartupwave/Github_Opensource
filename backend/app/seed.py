"""Default data on first start, plus optional demo data.

    python -m app.seed --demo           # add a demo team and ~240 sample leads (skipped if leads exist)
    python -m app.seed --reset --demo   # wipe the database and reseed from scratch
"""

import random
import sys
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine
from .models import (
    Activity,
    CustomField,
    CustomFieldValue,
    Lead,
    LeadFollowup,
    LeadNote,
    LeadSource,
    LeadStatus,
    Notification,
    Priority,
    Role,
    Tag,
    User,
    utcnow,
)
from .security import hash_password
from .settings_store import ensure_api_key

MANAGER_DEFAULT_PERMS = ["leads.create", "leads.edit"]


def seed_defaults(db: Session) -> None:
    if not db.scalar(select(func.count(Role.id))):
        db.add_all([
            Role(name="Admin", description="Full access to everything", is_admin=True, is_system=True, permissions=[]),
            Role(name="Manager", description="Works on leads assigned to them", is_system=True,
                 permissions=MANAGER_DEFAULT_PERMS),
        ])
        db.flush()

    if not db.scalar(select(func.count(User.id))):
        admin_role = db.scalar(select(Role).where(Role.is_admin.is_(True)))
        db.add(User(name="Admin", email="admin@crm.local", password_hash=hash_password("Admin@123"),
                    role_id=admin_role.id))

    if not db.scalar(select(func.count(LeadStatus.id))):
        for i, (name, color, cat) in enumerate([
            ("New", "#22c55e", "open"), ("Contacted", "#3b82f6", "open"), ("Interested", "#eab308", "open"),
            ("Follow Up", "#f97316", "open"), ("Proposal Sent", "#a855f7", "open"),
            ("Converted", "#10b981", "won"), ("Lost", "#ef4444", "lost"),
        ]):
            db.add(LeadStatus(name=name, color=color, category=cat, order=i, is_default=(i == 0)))

    if not db.scalar(select(func.count(LeadSource.id))):
        for i, (name, color) in enumerate([
            ("Website", "#6366f1"), ("Instagram", "#ec4899"), ("Google Ads", "#f59e0b"), ("Facebook", "#3b82f6"),
            ("Referral", "#10b981"), ("WhatsApp", "#22c55e"), ("Walk-in", "#14b8a6"), ("Other", "#94a3b8"),
        ]):
            db.add(LeadSource(name=name, key=name.lower().replace(" ", "_").replace("-", "_"), color=color, order=i))

    if not db.scalar(select(func.count(Priority.id))):
        for i, (name, color) in enumerate([("High", "#ef4444"), ("Medium", "#f59e0b"), ("Low", "#64748b")]):
            db.add(Priority(name=name, color=color, order=i, is_default=(name == "Medium")))

    if not db.scalar(select(func.count(Tag.id))):
        for name, color in [("Hot", "#ef4444"), ("VIP", "#a855f7"), ("Callback", "#3b82f6")]:
            db.add(Tag(name=name, color=color))

    if not db.scalar(select(func.count(CustomField.id))):
        db.add_all([
            CustomField(name="Budget", key="budget", field_type="dropdown", order=0, show_in_list=True,
                        options=["₹10k–₹25k", "₹25k–₹50k", "₹50k–₹1L", "₹1L+"]),
            CustomField(name="Customer Type", key="customer_type", field_type="dropdown", order=1,
                        options=["Individual", "Company", "Startup", "Enterprise"]),
        ])
    db.commit()
    ensure_api_key(db)




# ============================================================================ demo data

FIRST = ["Rahul", "Neha", "Mohit", "Anjali", "Vikram", "Sneha", "Arjun", "Pooja", "Karan", "Divya", "Rohan", "Isha",
         "Sameer", "Kavya", "Aditya", "Meera", "Nikhil", "Riya", "Siddharth", "Tanvi", "Varun", "Aisha", "Manish",
         "Shreya", "Harsh", "Nisha", "Gaurav", "Payal", "Kunal", "Simran", "Deepak", "Ritika", "Yash", "Ananya",
         "Pranav", "Sakshi", "Abhishek", "Neelam", "Tarun", "Megha"]
LAST = ["Sharma", "Verma", "Gupta", "Mehta", "Patel", "Singh", "Iyer", "Reddy", "Nair", "Joshi", "Kapoor", "Malhotra",
        "Chopra", "Bansal", "Agarwal", "Desai", "Kulkarni", "Rao", "Saxena", "Pillai", "Bhatt", "Khanna"]
COMPANIES = ["ABC Pvt Ltd", "XYZ Ltd", "Nimbus Tech", "Orbit Foods", "Zenith Realty", "BluePeak Labs", "Tata Traders",
             "Kiran Textiles", "Sunrise Interiors", "Vertex Solutions", "Greenleaf Organics", "Pixel Studio",
             "Metro Clinics", "Urban Bakers", "Skyline Builders", "Nova Fitness", None, None, None, None, None]
CITIES = ["Mumbai", "Delhi", "Pune", "Bengaluru", "Hyderabad", "Chennai", "Ahmedabad", "Jaipur"]
MESSAGES = ["Interested in your service", "Please share pricing", "Want a demo next week", "Looking for a quotation",
            "Call me after 5pm", "Need details for bulk order", "Do you provide services in my city?",
            "What is the timeline for delivery?", "Can we schedule a meeting?", None, None]
NOTES = ["Customer wants quotation.", "Asked to call back on Monday.", "Comparing with 2 other vendors.",
         "Budget approved, waiting on sign-off.", "Prefers WhatsApp over calls.", "Decision maker is the MD.",
         "Needs GST invoice.", "Wants a discount for annual plan.", "Very interested, follow up quickly.",
         "Busy this week, try next week.", "Asked for case studies.", "Referred by an existing client."]
CONTACT_SUMMARIES = {
    "call": ["Discussed requirements", "Explained pricing", "No answer, will retry", "Asked for a demo", "Shared timeline"],
    "whatsapp": ["Sent brochure", "Shared quotation PDF", "Sent greeting message", "Customer replied with questions"],
    "email": ["Sent proposal", "Shared case studies", "Sent follow-up email"],
    "meeting": ["Met at office, positive discussion", "Demo done, client liked it"],
}
FU_NOTES = ["Call regarding quotation", "Share brochure", "Demo walkthrough", "Check budget approval",
            "Send revised proposal", "Confirm meeting time", "Collect requirements", "Discuss contract terms"]
OUTCOMES = ["Spoke to client, positive", "Sent quotation", "Client asked for more time", "No response",
            "Scheduled demo", "Client agreed in principle"]
CHANNEL_TEXT = {"call": "by phone", "whatsapp": "on WhatsApp", "email": "by email", "meeting": "in a meeting"}


def _ensure_demo_config(db: Session) -> dict[str, CustomField]:
    extra = [
        ("Expected Value", "expected_value", "currency", [], True),
        ("Interested In", "interested_in", "multiselect", ["Website", "Mobile App", "SEO", "Social Media", "Branding"], False),
        ("Preferred Call Time", "preferred_call_time", "dropdown", ["Morning", "Afternoon", "Evening"], False),
        ("Wants Demo", "wants_demo", "checkbox", [], False),
        ("Requirement", "requirement", "textarea", [], False),
    ]
    order = (db.scalar(select(func.max(CustomField.order))) or 0) + 1
    for name, key, ftype, options, in_list in extra:
        if not db.scalar(select(CustomField).where(CustomField.key == key)):
            db.add(CustomField(name=name, key=key, field_type=ftype, options=options, show_in_list=in_list, order=order))
            order += 1
    for name, color in [("Hot", "#ef4444"), ("VIP", "#a855f7"), ("Callback", "#3b82f6"), ("Budget Approved", "#10b981")]:
        if not db.scalar(select(Tag).where(Tag.name == name)):
            db.add(Tag(name=name, color=color))
    for c in CITIES:
        if not db.scalar(select(Tag).where(Tag.name == c)):
            db.add(Tag(name=c, color="#0ea5e9"))
    db.flush()
    return {f.key: f for f in db.scalars(select(CustomField))}


def _ensure_demo_users(db: Session) -> tuple[list[User], User | None]:
    mgr_role = db.scalar(select(Role).where(Role.name == "Manager"))
    senior = db.scalar(select(Role).where(Role.name == "Senior Manager"))
    if not senior:
        senior = Role(name="Senior Manager", description="Sees all leads, can assign and view reports",
                      permissions=["leads.view_all", "leads.create", "leads.edit", "leads.assign", "leads.export",
                                   "reports.view"])
        db.add(senior)
        db.flush()
    people = [("Amit Kumar", "amit", mgr_role, True, "+91 98200 11111"),
              ("Priya Nair", "priya", mgr_role, True, "+91 98200 22222"),
              ("Rahul Verma", "rahul", mgr_role, True, "+91 98200 33333"),
              ("Rohit Singh", "rohit", mgr_role, True, "+91 98200 44444"),
              ("Neha Kapoor", "neha", senior, True, "+91 98200 55555"),
              ("Karan Mehta", "karan", mgr_role, False, "+91 98200 66666")]
    users = []
    for name, handle, role, active, phone in people:
        email = f"{handle}@crm.local"
        u = db.scalar(select(User).where(User.email == email))
        if not u:
            u = User(name=name, email=email, phone=phone, password_hash=hash_password("Manager@123"), role_id=role.id,
                     is_active=active)
            db.add(u)
        users.append(u)
    db.flush()
    return [u for u in users if u.is_active], next((u for u in users if not u.is_active), None)


def seed_demo(db: Session) -> None:
    if db.scalar(select(func.count(Lead.id))):
        print("Leads already exist - skipping demo data. Use --reset --demo to start over.")
        return
    rnd = random.Random(2026)
    now = utcnow()
    fields = _ensure_demo_config(db)
    managers, inactive = _ensure_demo_users(db)
    admin = db.scalar(select(User).where(User.email == "admin@crm.local"))
    everyone = managers + ([inactive] if inactive else [])

    statuses = db.scalars(select(LeadStatus).order_by(LeadStatus.order)).all()
    open_steps = [s for s in statuses if s.category == "open"]
    sources = db.scalars(select(LeadSource).order_by(LeadSource.order)).all()
    priorities = db.scalars(select(Priority).order_by(Priority.order)).all()
    all_tags = db.scalars(select(Tag)).all()
    city_tags = [t for t in all_tags if t.name in CITIES]
    label_tags = [t for t in all_tags if t.name not in CITIES]

    status_w = [11 if s.category == "won" else 8 if s.category == "lost" else 16 for s in statuses]
    source_w = ([30, 18, 15, 13, 10, 8, 4, 2] + [2] * len(sources))[: len(sources)]
    mgr_w = ([26, 22, 24, 16, 12] + [10] * len(managers))[: len(managers)]
    used_phones: set[str] = set()

    def new_phone() -> str:
        while True:
            p = f"9{rnd.randint(100000000, 999999999)}"
            if p not in used_phones:
                used_phones.add(p)
                return p

    def act(lead, action, desc, user=None, at=None, meta=None):
        db.add(Activity(action=action, lead_id=lead.id, user_id=user.id if user else None, created_at=at,
                        description=desc, meta=meta))

    n_leads = 240
    for i in range(n_leads):
        created = now - timedelta(days=rnd.triangular(0, 60, 4), minutes=rnd.randint(0, 900))
        first, last = rnd.choice(FIRST), rnd.choice(LAST)
        name = f"{first} {last}"
        st = rnd.choices(statuses, status_w)[0]
        src = rnd.choices(sources, source_w)[0]
        unassigned = i % 40 == 0  # a handful of fresh leads waiting for the admin
        if unassigned:
            created = now - timedelta(hours=rnd.randint(1, 30))
            st = statuses[0]
        mgr = None if unassigned else (inactive if inactive and i % 30 == 7 else rnd.choices(managers, mgr_w)[0])
        by_manager = mgr is not None and (src.key in ("walk_in", "referral") or rnd.random() < 0.15)
        creator = mgr if by_manager else (admin if rnd.random() < 0.12 else None)
        p = new_phone()
        lead = Lead(
            name=name, phone=f"+91 {p[:5]} {p[5:]}", phone_digits=p,
            email=f"{first.lower()}.{last.lower()}{rnd.randint(1, 99)}@{rnd.choice(['gmail.com', 'yahoo.in', 'outlook.com'])}",
            company=rnd.choice(COMPANIES), message=rnd.choice(MESSAGES), source_id=src.id, status_id=st.id,
            priority_id=rnd.choices(priorities, ([25, 45, 30] + [10] * len(priorities))[: len(priorities)])[0].id,
            assigned_to_id=mgr.id if mgr else None, created_by_id=creator.id if creator else None,
            enquiry_count=rnd.choices([1, 2, 3, 4, 5], [78, 12, 6, 3, 1])[0],
            created_at=created, updated_at=created, status_changed_at=created,
        )
        lead.tags = [rnd.choice(city_tags)] + rnd.sample(label_tags, rnd.choice([0, 0, 1, 1, 2]))
        db.add(lead)
        db.flush()

        def cf(key, value):
            if key in fields and value not in (None, "", []):
                db.add(CustomFieldValue(lead_id=lead.id, field_id=fields[key].id, value=value))

        if "budget" in fields and rnd.random() < 0.7:
            cf("budget", rnd.choice(fields["budget"].options))
        if rnd.random() < 0.6:
            cf("customer_type", "Company" if lead.company else rnd.choice(["Individual", "Startup"]))
        if rnd.random() < 0.55:
            cf("expected_value", float(rnd.choice([15000, 25000, 40000, 60000, 85000, 120000, 250000])))
        if "interested_in" in fields and rnd.random() < 0.5:
            cf("interested_in", rnd.sample(fields["interested_in"].options, rnd.randint(1, 3)))
        if "preferred_call_time" in fields and rnd.random() < 0.4:
            cf("preferred_call_time", rnd.choice(fields["preferred_call_time"].options))
        if rnd.random() < 0.3:
            cf("wants_demo", True)
        if rnd.random() < 0.25:
            cf("requirement", rnd.choice(["Need a new website with payment gateway.", "Looking for an app for our clinic.",
                                          "Want to improve Google ranking.", "Monthly social media management."]))

        # ---- timeline: created -> assigned -> status journey
        who = creator.name if creator else "System"
        act(lead, "lead_created", f"{who} created lead {name} from {src.name}" + ("" if creator else " via website/API"),
            creator, created, {"via": "ui" if creator else "api"})
        t = created + timedelta(seconds=2)
        if mgr:
            auto = creator is None or creator.id != mgr.id
            act(lead, "lead_assigned", f"Lead {'automatically ' if auto else ''}assigned to {mgr.name}",
                None if auto else creator, t, {"to": mgr.id, "auto": auto, "mode": "round_robin" if auto else None})
            db.add(Notification(user_id=mgr.id, type="lead_assigned", title=f"New lead assigned: {name}",
                                body=f"{lead.phone} from {src.name}", lead_id=lead.id, created_at=t,
                                is_read=(now - t) > timedelta(days=1) or rnd.random() < 0.5))
        if admin and created > now - timedelta(days=3):
            db.add(Notification(user_id=admin.id, type="new_lead", title=f"New lead: {name}",
                                body=f"{src.name} · " + (f"assigned to {mgr.name}" if mgr else "unassigned"),
                                lead_id=lead.id, created_at=t, is_read=rnd.random() < 0.4))

        span = max(timedelta(hours=1), (now - created) * 0.9)
        if st.category == "open":
            path = open_steps[: open_steps.index(st) + 1]
        else:
            path = open_steps[: rnd.randint(2, len(open_steps))] + [st]
        prev = path[0]
        steps = path[1:]
        actor = mgr or admin
        for k, nxt in enumerate(steps):
            t = min(now - timedelta(minutes=10), created + span * (k + 1) / (len(steps) + 1) + timedelta(minutes=rnd.randint(0, 90)))
            if k == 0 and actor:
                ch = rnd.choice(["call", "call", "whatsapp", "email"])
                act(lead, "contacted", f"{actor.name} contacted {name} {CHANNEL_TEXT[ch]}", actor,
                    t - timedelta(minutes=5), {"channel": ch, "summary": rnd.choice(CONTACT_SUMMARIES[ch])})
                lead.last_contact_at = t - timedelta(minutes=5)
            act(lead, "status_changed", f"{actor.name if actor else 'System'} changed status of {name}: {prev.name} → {nxt.name}",
                actor, t, {"from": {"id": prev.id, "name": prev.name, "color": prev.color},
                           "to": {"id": nxt.id, "name": nxt.name, "color": nxt.color}})
            prev = nxt
            lead.status_changed_at = t
            if nxt.category == "won":
                lead.converted_at = t
                if admin:
                    db.add(Notification(user_id=admin.id, type="conversion", title=f"🎉 Converted: {name}",
                                        body=f"by {actor.name if actor else 'System'}", lead_id=lead.id, created_at=t,
                                        is_read=(now - t) > timedelta(days=2)))

        # ---- extra contacts and notes
        if mgr:
            for _ in range(rnd.choice([0, 0, 1, 2])):
                ch = rnd.choice(["call", "whatsapp", "meeting", "email"])
                t = created + (now - created) * rnd.uniform(0.2, 0.95)
                act(lead, "contacted", f"{mgr.name} contacted {name} {CHANNEL_TEXT[ch]}", mgr, t,
                    {"channel": ch, "summary": rnd.choice(CONTACT_SUMMARIES[ch])})
                lead.last_contact_at = max(lead.last_contact_at or t, t)
            for _ in range(rnd.choice([0, 1, 1, 2, 3])):
                t = created + (now - created) * rnd.uniform(0.1, 0.95)
                content = rnd.choice(NOTES)
                db.add(LeadNote(lead_id=lead.id, user_id=mgr.id, content=content, created_at=t))
                act(lead, "note_added", f"{mgr.name} added a note", mgr, t, {"content": content})

        # ---- repeat enquiries
        for n in range(2, lead.enquiry_count + 1):
            t = created + (now - created) * (n - 1) / lead.enquiry_count
            msg = rnd.choice(["Following up on my enquiry", "Still interested, please call", "Any update on pricing?"])
            db.add(LeadNote(lead_id=lead.id, user_id=None, content=f"Repeat enquiry #{n} via {src.name}: {msg}", created_at=t))
            act(lead, "enquiry_repeat", f"Repeat enquiry #{n} via {src.name}", None, t, {"message": msg, "source": src.name})

        # ---- follow-ups: completed ones in the past + the next pending one for open leads
        if mgr:
            for _ in range(rnd.choice([0, 1, 1, 2])):
                due = created + (now - created) * rnd.uniform(0.3, 0.9)
                if due >= now - timedelta(hours=1):
                    continue
                f_type = rnd.choice(["call", "call", "meeting", "whatsapp"])
                note, outcome = rnd.choice(FU_NOTES), rnd.choice(OUTCOMES)
                db.add(LeadFollowup(lead_id=lead.id, assigned_to_id=mgr.id, created_by_id=mgr.id, due_at=due,
                                    type=f_type, note=note, status="done", outcome=outcome,
                                    completed_at=due + timedelta(minutes=20), notified_due=True, notified_overdue=True,
                                    created_at=due - timedelta(days=1)))
                act(lead, "followup_completed", f"{mgr.name} completed a {f_type} follow-up", mgr,
                    due + timedelta(minutes=20), {"outcome": outcome, "note": note})
            if st.category == "open" and rnd.random() < 0.75:
                due = now + timedelta(hours=rnd.choice([-70, -40, -20, -5, 2, 5, 20, 26, 30, 50, 75, 120, 160]))
                due = due.replace(minute=rnd.choice([0, 30]), second=0, microsecond=0)
                f_type = rnd.choice(["call", "call", "meeting", "whatsapp", "email"])
                note = rnd.choice(FU_NOTES)
                scheduled = min(now - timedelta(minutes=30), max(created + timedelta(minutes=10), due - timedelta(days=2)))
                db.add(LeadFollowup(lead_id=lead.id, assigned_to_id=mgr.id, created_by_id=mgr.id, due_at=due,
                                    type=f_type, note=note, notified_due=due < now, notified_overdue=due < now,
                                    created_at=scheduled))
                act(lead, "followup_created", f"{mgr.name} scheduled a {f_type} follow-up", mgr, scheduled,
                    {"due_at": due.isoformat() + "Z", "note": note, "type": f_type})
                lead.next_followup_at = due
                if due < now:
                    db.add(Notification(user_id=mgr.id, type="followup_overdue", title=f"Overdue follow-up: {name}",
                                        body=note, lead_id=lead.id, created_at=due + timedelta(minutes=15),
                                        is_read=rnd.random() < 0.3))

        lead.updated_at = max(created, lead.status_changed_at or created, lead.last_contact_at or created)

    # ---- login history and user-management trail
    for u in [admin] + everyone:
        if not u:
            continue
        for d in range(0, 20, rnd.choice([1, 2, 3])):
            t = now - timedelta(days=d, hours=rnd.randint(1, 6), minutes=rnd.randint(0, 59))
            db.add(Activity(action="login", user_id=u.id, description=f"{u.name} logged in", created_at=t,
                            ip=f"49.36.{rnd.randint(1, 250)}.{rnd.randint(1, 250)}"))
            if rnd.random() < 0.5:
                db.add(Activity(action="logout", user_id=u.id, description=f"{u.name} logged out",
                                created_at=min(now, t + timedelta(hours=rnd.randint(1, 8)))))
        u.last_login_at = now - timedelta(hours=rnd.randint(1, 30))
    if admin:
        for u in everyone:
            db.add(Activity(action="user_created", user_id=admin.id, created_at=now - timedelta(days=61),
                            description=f"{admin.name} created user {u.name} ({u.role.name})",
                            meta={"target_user_id": u.id}))
        if inactive:
            db.add(Activity(action="user_disabled", user_id=admin.id, created_at=now - timedelta(days=9),
                            description=f"{admin.name} deactivated {inactive.name}", meta={"target_user_id": inactive.id}))
    db.commit()
    print(f"Demo data added: {n_leads} leads, {len(everyone)} team members.")
    print("Logins: admin@crm.local / Admin@123 | amit, priya, rahul, rohit @crm.local (Manager), "
          "neha@crm.local (Senior Manager) - password Manager@123")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
        print("Database reset.")
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        seed_defaults(s)
        if "--demo" in sys.argv:
            seed_demo(s)
