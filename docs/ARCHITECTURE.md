# Architecture

This page explains how the CRM is put together, so you can find the right file for your change quickly.
Read the [README](../README.md) first to get the app running.

## The big picture

```
┌──────────────────────── Browser ────────────────────────┐
│  Next.js app (http://localhost:8765)                    │
│                                                         │
│  src/app/(app)/leads/page.tsx   ◄── a page              │
│        │ uses                                           │
│  src/components/*               ◄── reusable UI         │
│        │ calls                                          │
│  src/lib/api.ts  ── fetch() + "Authorization: Bearer"   │
└────────┼────────────────────────────────────────────────┘
         │ HTTP / JSON
┌────────▼──────── FastAPI (http://localhost:8766) ───────┐
│  main.py            registers routers, CORS, lifespan   │
│  routers/leads.py   endpoint functions                  │
│     │  Depends(require_perm(...))  ◄── security.py      │
│     │  body validated by           ◄── schemas.py       │
│     ▼                                                   │
│  lead_core.py / services.py   business logic            │
│     ▼                                                   │
│  models.py (SQLAlchemy)  ──►  crm.db (SQLite)           │
└─────────────────────────────────────────────────────────┘
```

The frontend and backend are **two separate apps** that talk only over HTTP. You can work on one
without touching the other, as long as the API contract (URLs and JSON shapes) stays the same.

---

## Backend (`backend/app/`)

### Startup: `main.py`

When uvicorn starts the app, the `lifespan` function:

1. creates any missing tables (`Base.metadata.create_all`)
2. seeds defaults (statuses, sources, priorities, the Admin and Manager roles, the admin user) via
   `seed.seed_defaults`
3. starts `_reminder_loop`, a background task that runs `services.check_followup_reminders` every
   60 seconds and turns due follow-ups into notifications.

It then adds CORS and includes every router. **If you add a new router file, add it to the `for r in (...)`
loop in `main.py`.**

### Data model: `models.py`

| Model | Table | What it stores |
|---|---|---|
| `Role` | `roles` | Name, `is_admin`, and a list of permission keys (see `PERMISSIONS`) |
| `User` | `users` | Login, role, `is_active`, `token_version` (bumped to sign a user out everywhere) |
| `Lead` | `leads` | The core record: contact details, status, source, priority, assignee, tags, follow-up dates |
| `LeadStatus` / `LeadSource` / `Priority` / `Tag` | … | Admin-editable lookup lists (name, colour, order) |
| `LeadNote` | `lead_notes` | Notes on a lead |
| `LeadFollowup` | `lead_followups` | Scheduled follow-ups (due date, state, outcome) |
| `CustomField` / `CustomFieldValue` | … | Admin-defined extra fields and their per-lead values |
| `Activity` | `activity_logs` | The audit log and lead timeline |
| `Notification` | `notifications` | In-app notifications per user |
| `AppSetting` | `app_settings` | Key → JSON settings (assignment, integration, messaging, …) |

There are **no migrations** (no Alembic). Tables are created on startup. If you change a column,
reset your local database with `python -m app.seed --reset --demo`.

### Auth and permissions: `security.py`

- Passwords are hashed with **bcrypt**.
- Logging in (`POST /api/auth/login`) returns a **JWT** that holds the user id and `token_version`.
- Endpoints pick one of these dependencies:

  ```python
  user: User = Depends(get_current_user)            # any logged-in user
  user: User = Depends(require_perm("leads.edit"))  # needs a permission
  user: User = Depends(require_admin)               # admins only
  ```

- Permission keys are listed in `models.PERMISSIONS`. Admin roles implicitly have all of them.
- **Lead visibility:** `services.lead_visibility()` / `can_see_lead()` restrict users without
  `leads.view_all` to the leads assigned to them (plus the shared pool in "shared" mode).

### Routers: `routers/*.py`

| File | Prefix | Responsibility |
|---|---|---|
| `auth.py` | `/api/auth` | login, logout, `me`, update profile, change password |
| `users.py` | `/api` | users and roles CRUD |
| `leads.py` | `/api/leads` | list/search/filter, pipeline, export/import CSV, create, update, delete, move, assign, claim, bulk, notes, contact log, follow-ups |
| `followups.py` | `/api/followups` | follow-up list, summary, update, delete |
| `customize.py` | `/api` | `GET /meta` (all lookup lists at once), statuses, sources, priorities, tags, custom fields |
| `activity.py` | `/api` | audit log, notifications |
| `reports.py` | `/api` | dashboard and reports numbers |
| `settings.py` | `/api/settings` | read and update settings, regenerate the API key |
| `public.py` | `/api/public` | website form intake, authenticated by API key |

Open http://localhost:8766/docs to try every endpoint from the browser. Click **Authorize** and paste
a token from `/api/auth/login`.

### Business logic: `lead_core.py` and `services.py`

Routers stay thin and call these shared helpers:

- `lead_core.create_lead()`: used by the UI, CSV import **and** website intake. Handles defaults,
  duplicate detection (`find_duplicate`), custom fields, auto-assignment and notifications.
- `lead_core.change_status()` / `assign_lead()`: status and owner changes, with activity logging.
- `services.pick_assignee()`: the auto-assignment modes (round robin, least loaded, specific, by
  source, shared).
- `services.log_activity()`: writes to the audit log. **Call this for any action a user would want
  to see in the history.**
- `services.notify()` / `notify_admins()`: create in-app notifications.

### Example: what happens on `POST /api/leads`

1. `leads.create_lead_endpoint` runs. With no logged-in user it hands off to website intake
   (`X-API-Key`).
2. It checks the `leads.create` permission and validates the body with `schemas.LeadIn`.
3. It calls `lead_core.create_lead(...)`, which fills defaults, picks an assignee, saves custom fields,
   logs activity and notifies the assignee.
4. `db.commit()`, then it returns `lead_out(...)`, the JSON the frontend expects.

### Tests: `tests/test_smoke.py`

A single end-to-end test drives the API through FastAPI's `TestClient` against a temporary SQLite
database: login, users, website intake, assignment modes, manager scoping, and more. Add your own
`test_*.py` files next to it. The `login()` helper at the top shows how to get auth headers.

---

## Frontend (`frontend/src/`)

### Routing (Next.js App Router)

| Path | File |
|---|---|
| `/` | `app/page.tsx` redirects to the dashboard or login |
| `/login` | `app/login/page.tsx` |
| `/dashboard` | `app/(app)/dashboard/page.tsx` |
| `/leads`, `/leads/pipeline`, `/leads/123` | `app/(app)/leads/...` |
| `/followups`, `/activity`, `/notifications`, `/reports`, `/users`, `/settings` | `app/(app)/<name>/page.tsx` |

`(app)` is a **route group**: the folder name doesn't appear in the URL. Its `layout.tsx` wraps
every logged-in page with the sidebar, top bar, mobile tab bar and session checks.

### Data flow

- **`lib/api.ts`**: `api<T>(path, { method, json })` is the only way pages talk to the backend. It
  adds the token, parses JSON and throws an `ApiError` with a readable message. A 401 response logs the
  user out.
- **`lib/session.tsx`**: `useSession()` gives you `me` (the current user), `meta` (statuses, sources,
  priorities, tags, custom fields) and `can("leads.edit")` for permission checks in the UI.
- **`lib/types.ts`**: TypeScript types that mirror the API responses. Update them when the API changes.

A typical page:

```tsx
"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, PageLoader, useToast } from "@/components/ui";

export default function ExamplePage() {
  const [data, setData] = useState<any>(null);
  const toast = useToast();

  useEffect(() => {
    api("/api/dashboard").then(setData).catch((e) => toast(e.message, "error"));
  }, []);

  if (!data) return <PageLoader />;
  return <PageHeader title="Example" subtitle={`${data.totals?.total ?? 0} leads`} />;
}
```

### UI building blocks

- **`components/ui.tsx`**: `Modal`, `ConfirmModal`, `Dropdown`, `MenuItem`, `MultiSelect`, `Badge`,
  `StatusBadge`, `Avatar`, `Empty`, `PageHeader`, `Field`, `Toggle`, `Tabs`, `Pagination`, `Spinner`,
  `useToast`, `useIsMobile`, `useClickOutside`.
- **`app/globals.css`**: Tailwind 4 plus shared classes such as `.btn`, `.btn-primary`, `.input`,
  `.card`, `.td`.
- **`components/LeadForm.tsx`**: create and edit a lead, including custom fields.
- **`components/ContactMenu.tsx`**: Call, WhatsApp, SMS and email actions.
- **`components/Timeline.tsx`**: the activity timeline on the lead page.
- **`components/charts.tsx`**: small dependency-free charts used on the dashboard and reports.
- **`lib/format.ts`**: `fmtDate`, `relative` ("3h ago"), `num`, `initials`, and more.

---

## Where do I make my change?

| I want to… | Look at |
|---|---|
| Add a field to leads | `models.Lead` → `schemas.LeadIn`/`LeadUpdate` → `lead_core.lead_out` → `lib/types.ts` → `LeadForm.tsx` and the lead page |
| Add a new API endpoint | The matching `routers/*.py` (+ a schema in `schemas.py`, + a test) |
| Add a new permission | `models.PERMISSIONS`, then use `require_perm("...")`, then `can("...")` in the UI |
| Change what the dashboard shows | `routers/reports.py` + `app/(app)/dashboard/page.tsx` |
| Add a new page | `app/(app)/<name>/page.tsx` + a nav link in `app/(app)/layout.tsx` |
| Change a reusable UI element | `components/ui.tsx` |
| Change demo data | `seed.py` (`seed_demo`) |
