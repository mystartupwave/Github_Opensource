# CRM: Open-Source Lead Management

A full-stack **lead-management CRM**, open for anyone to contribute to. It was built for hands-on
open-source workshops, where students make their first real pull request on a working product.

- **Backend:** Python, [FastAPI](https://fastapi.tiangolo.com/), SQLAlchemy, SQLite
- **Frontend:** [Next.js 15](https://nextjs.org/) (App Router), React 19, TypeScript, Tailwind CSS 4

> **Issue [#2](../../issues/2):** Add docstrings to every public function in `backend/app/services.py`.
> See the issue for details and claim it by commenting.

> **New to open source?** Start with [CONTRIBUTING.md](CONTRIBUTING.md). It walks you from
> "I have never made a pull request" to a merged contribution, one command at a time.
> Then pick a task from [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md).

---

## Table of contents

1. [What the app does](#what-the-app-does)
2. [Prerequisites](#prerequisites)
3. [Quick start](#quick-start)
4. [Demo logins](#demo-logins)
5. [Project structure](#project-structure)
6. [How it works](#how-it-works)
7. [Configuration](#configuration)
8. [Running tests and checks](#running-tests-and-checks)
9. [Features in detail](#features-in-detail)
10. [Contributing](#contributing)
11. [Troubleshooting](#troubleshooting)
12. [License](#license)

---

## What the app does

Sales teams use this CRM to collect **leads** (potential customers), assign them to managers, track
every call and follow-up, and see which sources and people convert best.

| Area | What you can do |
|---|---|
| Leads | Create, search, filter, bulk-edit, import or export CSV, add custom fields |
| Pipeline | Kanban board: drag a lead between statuses |
| Follow-ups | Reminders grouped into overdue, today, tomorrow and later |
| Assignment | Auto-assign new leads: round robin, least loaded, by source, and more |
| Website intake | Websites post leads straight into the CRM with an API key |
| Reports | Dashboard, conversion rates, manager leaderboards |
| Users & roles | Admin, Manager and custom roles with fine-grained permissions |
| Audit log | Every important action, with who did it, when and from which IP address |

## Prerequisites

Install these once:

| Tool | Version | Check with |
|---|---|---|
| [Git](https://git-scm.com/downloads) | any recent | `git --version` |
| [Python](https://www.python.org/downloads/) | **3.10 or newer** | `python --version` (or `python3 --version`) |
| [Node.js](https://nodejs.org/) | **20 or newer** (LTS) | `node --version` |
| A code editor | e.g. [VS Code](https://code.visualstudio.com/) | |

> **Windows tip:** when installing Python, tick **"Add python.exe to PATH"**.

## Quick start

First **fork** the repo and **clone your fork**. If you haven't done that before, follow
[CONTRIBUTING.md → Step 1](CONTRIBUTING.md#step-1--fork-and-clone). Then:

### 1. Backend (API on port 8766)

**Windows (PowerShell):**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python -m app.seed --demo
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8766
```

**macOS / Linux:**

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m app.seed --demo
.venv/bin/python -m uvicorn app.main:app --reload --port 8766
```

Open **http://localhost:8766/docs** to see the interactive API documentation (Swagger UI).

> If PowerShell blocks scripts, you don't need to "activate" the venv. The commands above call
> `.venv\Scripts\python` directly, so they work without activation.

### 2. Frontend (web app on port 8765)

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:8765** and log in with one of the [demo logins](#demo-logins).

### 3. Next time: one command

After the first setup, start both apps at once from the project root:

- Windows: `.\start.ps1`
- macOS / Linux: `./start.sh`

### Seeding the database

| Command (run inside `backend/`) | What it does |
|---|---|
| *(nothing)* | On first start the API creates `crm.db` with default statuses, sources, priorities and one admin |
| `python -m app.seed --demo` | Adds a demo team and about 240 sample leads (skipped if leads already exist) |
| `python -m app.seed --reset --demo` | **Wipes the database** and reseeds from scratch. Use this when your data gets messy |

## Demo logins

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@crm.local` | `Admin@123` | Can do everything |
| Senior Manager | `neha@crm.local` | `Manager@123` | Sees all leads, can assign, sees reports |
| Manager | `amit@crm.local`, `priya@crm.local`, `rahul@crm.local`, `rohit@crm.local` | `Manager@123` | Sees only their own leads |
| Deactivated | `karan@crm.local` | – | Shows the "deactivated user" state; cannot log in |

Only the admin account exists without `--demo`. These are **local development credentials only**.

## Project structure

```
Github_Opensource/
├── backend/                    FastAPI app
│   ├── app/
│   │   ├── main.py             App entry point: creates tables, registers routers, starts reminder loop
│   │   ├── database.py         SQLAlchemy engine and session (SQLite by default)
│   │   ├── models.py           Database tables (User, Role, Lead, LeadStatus, Activity, ...)
│   │   ├── schemas.py          Pydantic models: request/response validation
│   │   ├── security.py         Password hashing, JWT tokens, permission checks
│   │   ├── lead_core.py        Shared lead logic (create, dedupe, assign)
│   │   ├── services.py         Activity logging, notifications, follow-up reminders
│   │   ├── settings_store.py   Key/value app settings stored in the database
│   │   ├── seed.py             Default data and demo data
│   │   └── routers/            One file per API area
│   │       ├── auth.py         /api/auth/*: login, logout, profile, change password
│   │       ├── users.py        /api/users, /api/roles
│   │       ├── leads.py        /api/leads/*: CRUD, pipeline, bulk, import/export, notes
│   │       ├── followups.py    /api/followups/*
│   │       ├── customize.py    /api/meta, statuses, sources, priorities, tags, custom fields
│   │       ├── activity.py     /api/activity, /api/notifications
│   │       ├── reports.py      /api/dashboard, /api/reports
│   │       ├── settings.py     /api/settings/*
│   │       └── public.py       /api/public/leads: website form intake (API key)
│   ├── tests/test_smoke.py     End-to-end test of the whole API
│   ├── requirements.txt        Runtime dependencies
│   └── requirements-dev.txt    + test dependencies (pytest, httpx)
│
├── frontend/                   Next.js app
│   └── src/
│       ├── app/
│       │   ├── login/          Login page
│       │   ├── (app)/          Pages behind login (shared sidebar layout in layout.tsx)
│       │   │   ├── dashboard/  leads/  leads/[id]/  leads/pipeline/
│       │   │   ├── followups/  activity/  notifications/  reports/
│       │   │   └── users/  settings/
│       │   ├── layout.tsx      Root HTML layout
│       │   └── globals.css     Tailwind setup and shared CSS classes (.btn, .input, .card, ...)
│       ├── components/         Reusable UI: ui.tsx (Modal, Badge, Dropdown, ...), LeadForm, charts
│       │   └── settings/       Settings page tabs
│       └── lib/
│           ├── api.ts          fetch wrapper: adds the auth token, handles errors
│           ├── session.tsx     Logged-in user context
│           ├── types.ts        TypeScript types that mirror the API responses
│           ├── format.ts       Date and number formatting helpers
│           └── contact.ts      Phone, WhatsApp and email link helpers
│
├── docs/
│   ├── ARCHITECTURE.md         Deeper walk-through of how a request flows through the code
│   └── GOOD_FIRST_ISSUES.md    Ready-to-pick tasks for new contributors
├── .github/                    Issue/PR templates and CI workflow
├── CONTRIBUTING.md             Step-by-step contribution guide
├── CODE_OF_CONDUCT.md
├── start.ps1 / start.sh        Start both apps in one go
└── LICENSE
```

## How it works

```
 Browser (Next.js, :8765)                         FastAPI (:8766)                SQLite
 ────────────────────────                         ───────────────                ──────
 page.tsx ──► lib/api.ts ── fetch + Bearer JWT ──► routers/*.py ──► models.py ──► crm.db
                 ▲                                    │
                 └──────────── JSON response ◄────────┘  (validated by schemas.py)
```

1. You log in on `/login`. The API checks the password (bcrypt) and returns a **JWT token**.
2. The frontend stores the token in `localStorage` and `lib/api.ts` sends it as
   `Authorization: Bearer <token>` on every request.
3. Each router uses dependencies from `security.py` (`get_current_user`, `require_perm("leads.edit")`,
   `require_admin`) to decide who may do what.
4. Actions that change data call `services.log_activity(...)`, which creates the audit log and timeline.
5. A background loop in `main.py` checks every minute for due follow-ups and creates notifications.

For a longer walk-through with code pointers, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Configuration

Everything works with the defaults. To change a setting, set an **environment variable** before
starting the app.

| Variable | App | Default | Purpose |
|---|---|---|---|
| `CRM_DATABASE_URL` | backend | `sqlite:///./crm.db` | Database location |
| `CRM_SECRET_KEY` | backend | a dev-only value | Key used to sign login tokens. Set a long random value anywhere outside local dev |
| `CRM_CORS_ORIGINS` | backend | `*` | Comma-separated list of origins allowed to call the API |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:8766` | Where the frontend finds the API. Copy `frontend/.env.local.example` to `frontend/.env.local` to change it |

Example (PowerShell): `$env:CRM_DATABASE_URL="sqlite:///./other.db"`. Example (bash): `export CRM_DATABASE_URL=sqlite:///./other.db`.

## Running tests and checks

Run these **before you open a pull request**. CI runs the same checks on every PR.

```bash
# Backend tests (from backend/)
.venv\Scripts\python -m pytest tests -q        # Windows
.venv/bin/python -m pytest tests -q            # macOS / Linux

# Frontend type check and production build (from frontend/)
npx tsc --noEmit
npm run build
```

The backend test uses its own temporary database, so it never touches your `crm.db`.

## Features in detail

- **Users & roles**: Admin and Manager roles, plus custom roles with per-permission toggles (view all
  leads, create, edit, delete, assign, export, import, reports, all activity). Create, edit, deactivate,
  reset a password, or delete a user (their leads get reassigned). Resetting a password or deactivating
  a user signs them out immediately.
- **Leads**: standard fields plus **admin-defined custom fields** (text, number, email, phone, date,
  dropdown, multi-select, checkbox, text area, currency). Search by name, phone, email, company or ID
  (`LD-10042`). Filter by status, manager, source, priority, tags, follow-up, stage, created date and
  any dropdown custom field. Bulk assign, status, priority, tag and delete. CSV import and export.
- **Custom statuses, sources, priorities and tags**: admins set the name, colour and order. Each status
  is typed as *open*, *won* or *lost*, which drives conversion stats.
- **Pipeline**: Kanban board. Drag a card to change its status. On touch screens, use the "Move" menu.
- **Lead page**: status stepper, inline edits, notes, "log contact" (call, WhatsApp, email and more),
  follow-ups, and a full **activity timeline** grouped by day.
- **Follow-ups**: overdue, today, tomorrow and later buckets. Mark done (with outcome), snooze or cancel.
- **Auto-assignment** (Settings → Lead assignment), with an on/off switch and five modes:
  - **Round robin**: rotates through a chosen group (or all managers)
  - **Least loaded**: goes to the manager with the fewest open leads
  - **Single manager**: every lead goes to one person
  - **Source-based rules**: e.g. Instagram → Priya, with a fallback
  - **Shared pool**: all managers see the lead; the first to claim it owns it
- **Website form / API intake**: `POST /api/leads` with an `X-API-Key` header, or a plain HTML form
  posting to `/api/public/leads?api_key=…`. Snippets are in Settings → Website forms & API.
  **Repeat enquiries** (same phone or email) update the existing lead and increase its enquiry count.
- **Audit log**: logins, failed logins, lead changes, notes, follow-ups, imports/exports, user and
  settings changes, each recorded with who, when and the IP address.
- **Dashboard & reports**: totals, leads by status and source, 14-day trend, manager performance,
  leaderboards, source conversion rates, top repeat enquirers.
- **Call / WhatsApp / SMS / Email** from every lead, with WhatsApp message templates admins can edit
  (placeholders like `{first_name}` and `{manager}`). Each contact is logged on the lead's timeline.
- **Mobile-first layout**: bottom tab bar, card lists instead of tables on small screens, bottom-sheet
  menus, and a sticky Call / WhatsApp bar on the lead page.
- **In-app notifications**: new or reassigned leads, due or overdue follow-ups, conversions and more.
  Each type can be switched on or off.

## Contributing

Contributions of every size are welcome: typo fixes, docs, tests, UI polish, new features.

1. Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full step-by-step workflow.
2. Pick a task from **[docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md)** or the repo's
   [Issues](../../issues) tab (look for the `good first issue` label).
3. Comment on the issue so others know you're working on it.
4. Open a pull request. A maintainer will review it.

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Troubleshooting

| Problem | Fix |
|---|---|
| `python` is not recognized | Reinstall Python with "Add to PATH" ticked, or use `py` (Windows) / `python3` (macOS/Linux) |
| `Port 8766 is already in use` | Another API is running. Close it, or start with `--port 8767` and set `NEXT_PUBLIC_API_URL` to match |
| Login page says it can't reach the server | The backend isn't running. Start it and check http://localhost:8766/api/health |
| `npm install` fails | Check `node --version` is 20+. Delete `frontend/node_modules` and try again |
| Data looks broken after experimenting | `python -m app.seed --reset --demo` gives you a fresh database |
| `start.ps1 cannot be loaded because running scripts is disabled` | Run `powershell -ExecutionPolicy Bypass -File .\start.ps1` |

Still stuck? [Open an issue](../../issues/new/choose) and include the error message and your OS.

## License

Released under the [MIT License](LICENSE).
