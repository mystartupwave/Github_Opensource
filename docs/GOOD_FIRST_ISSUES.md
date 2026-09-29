# Good First Issues

Ready-to-pick tasks for new contributors. Each has a difficulty, the files to look at, and what
"done" means.

**How to claim one:** find the matching GitHub issue (or ask a maintainer to create it), comment
"I'd like to work on this", and wait to be assigned. Then follow [CONTRIBUTING.md](../CONTRIBUTING.md).

| Level | Meaning |
|---|---|
| 🟢 Easy | A few lines in one or two files. Good for your first PR |
| 🟡 Medium | Touches a few files, or needs frontend and backend changes |
| 🔴 Hard | Design decisions involved. Discuss your approach in the issue first |

> Maintainers: copy each task below into a GitHub issue using the **Good first issue** template, and
> add the labels `good first issue` plus `easy`, `medium` or `hard`.

---

## 📝 Documentation (no coding setup needed)

### 1. 🟢 Add screenshots to the README
- **Files:** `README.md`, new folder `docs/images/`
- **Task:** Take screenshots of the Dashboard, Leads list, Pipeline and Lead detail pages (logged in
  with demo data). Add them to a "Screenshots" section in the README.
- **Done when:** the images show up on GitHub, and each is under 500 KB (compress with
  [TinyPNG](https://tinypng.com/) or similar).

### 2. 🟢 Add docstrings to the helpers in `services.py`
- **Files:** `backend/app/services.py`
- **Task:** Most functions (`notify`, `pick_assignee`, `lead_visibility`, `day_bounds`, …) have no
  docstring. Add a one- or two-line docstring to each, explaining what it does and returns.
- **Done when:** every public function in the file has an accurate docstring and the tests still pass.

### 3. 🟢 Document the website-form API with a working example
- **Files:** `docs/` (new file `WEBSITE_FORMS.md`), link it from `README.md`
- **Task:** Using `backend/app/routers/public.py` and Settings → Website forms & API in the app,
  write a guide with a `curl` example and a plain HTML `<form>` example that create a lead. Include
  the accepted field names and aliases (e.g. `full_name`, `mobile`).
- **Done when:** someone can follow the guide from scratch and see their lead appear in the CRM.

---

## 🎨 Frontend

### 4. 🟢 Add a custom 404 page
- **Files:** new `frontend/src/app/not-found.tsx`
- **Task:** Visiting an unknown URL like `/abc` shows Next.js's default 404. Make a friendly page in the
  CRM's style: an icon, "Page not found", and a button back to `/dashboard`. Reuse `Empty` from
  `components/ui.tsx`.
- **Done when:** `/abc` shows your page on desktop and mobile widths.

### 5. 🟢 Keyboard shortcut: `/` focuses the search box
- **Files:** `frontend/src/app/(app)/layout.tsx` (the top-bar search input)
- **Task:** Pressing `/` anywhere (except while typing in an input or textarea) should focus the
  global search box, like on GitHub. Show a small `/` hint inside the input on desktop.
- **Done when:** the shortcut works, doesn't fire while typing in other fields, and the hint is hidden
  on mobile.

### 6. 🟢 Copy button for the lead ID
- **Files:** `frontend/src/app/(app)/leads/[id]/page.tsx` (look for `lead.code`)
- **Task:** Next to the `LD-10042`-style code on the lead page, add a small copy icon (`Copy` from
  `lucide-react`). Clicking it copies the code and shows a toast ("Lead ID copied"). See
  `components/ContactMenu.tsx` for how copying and toasts are done already.
- **Done when:** clicking copies the code, and the toast appears.

### 7. 🟢 Search box on the Users page
- **Files:** `frontend/src/app/(app)/users/page.tsx`
- **Task:** Add a search input above the users list that filters by name, email or phone as you type.
  Filtering in the browser is fine; no backend change needed.
- **Done when:** filtering works on both the desktop table and the mobile card list, and the empty
  result shows a friendly message.

### 8. 🟡 Password strength indicator
- **Files:** `frontend/src/app/(app)/settings/page.tsx` (change password),
  `frontend/src/app/(app)/users/page.tsx` (create user / reset password), new component in
  `frontend/src/components/`
- **Task:** Build a reusable `<PasswordStrength password={…} />` bar (weak / fair / strong) based on
  length, digits, symbols and mixed case. Use it in all three places.
- **Done when:** the bar updates as you type. It's only a hint; the server rules don't change.

### 9. 🟡 Set up ESLint so `npm run lint` works
- **Files:** `frontend/package.json`, new `frontend/eslint.config.mjs`, `.github/workflows/ci.yml`
- **Task:** `npm run lint` currently fails because ESLint isn't installed or configured. Add
  `eslint` + `eslint-config-next` with a flat config, then fix or explicitly disable the warnings it
  reports. Add a lint step to the frontend CI job.
- **Done when:** `npm run lint` passes locally and in CI.

### 10. 🔴 Dark mode
- **Files:** `frontend/src/app/globals.css`, `frontend/src/app/(app)/layout.tsx`, components using
  hard-coded `bg-white` / `text-slate-*`
- **Task:** Add a light / dark / system theme toggle, saved in `localStorage`. Start with the layout,
  cards, inputs and tables. **Post your plan in the issue before starting.** This is best split into
  several PRs.
- **Done when:** the main pages are readable in dark mode, with no white flashes.

---

## ⚙️ Backend

### 11. 🟢 Richer health check
- **Files:** `backend/app/main.py`, `backend/tests/`
- **Task:** `GET /api/health` returns only `{"ok": true}`. Also return the app `version` and a
  `database` field that is `"ok"` if a `SELECT 1` succeeds. Add a test.
- **Done when:** the endpoint returns e.g. `{"ok": true, "version": "1.0.0", "database": "ok"}` and
  the test passes.

### 12. 🟢 `--leads N` option for demo seeding
- **Files:** `backend/app/seed.py` (look for `n_leads = 240`), `README.md`
- **Task:** Allow `python -m app.seed --demo --leads 50` to control how many demo leads are created.
  Default stays 240. Use `argparse` for the options.
- **Done when:** the flag works, `--reset` and `--demo` still work, and the README documents the flag.

### 13. 🟢 Load backend settings from a `.env` file
- **Files:** `backend/requirements.txt`, `backend/app/database.py` or `main.py`, new
  `backend/.env.example`, `README.md`
- **Task:** The backend only reads real environment variables. Add `python-dotenv` so a
  `backend/.env` file is loaded on startup. Provide a `.env.example` listing `CRM_SECRET_KEY`,
  `CRM_DATABASE_URL` and `CRM_CORS_ORIGINS`. (`backend/.env` is already git-ignored.)
- **Done when:** values in `backend/.env` take effect, and the README's Configuration section explains it.

### 14. 🟡 More API tests
- **Files:** new `backend/tests/test_tags.py`, `backend/tests/test_followups.py`
- **Task:** The only test is one big smoke test. Add focused tests:
  - tags: create, rename, delete, and a manager (non-admin) getting `403`
  - follow-ups: create on a lead, snooze, mark done with an outcome, and check `/api/followups/summary`
  Copy the temporary-database setup and `login()` helper from `test_smoke.py`. Move shared setup to a
  `conftest.py` fixture if you like.
- **Done when:** `pytest tests -q` passes with your new tests.

### 15. 🟡 Export follow-ups as a calendar file (`.ics`)
- **Files:** `backend/app/routers/followups.py`, `frontend/src/app/(app)/followups/page.tsx`
- **Task:** Add `GET /api/followups/export.ics` that returns the current user's upcoming follow-ups as
  an iCalendar file (write the text format by hand, no new dependency). Add an "Add to calendar"
  button on the Follow-ups page (see `download()` in `lib/api.ts`).
- **Done when:** the file imports into Google Calendar or Outlook, and managers only get their own
  follow-ups.

### 16. 🔴 Limit repeated failed logins
- **Files:** `backend/app/routers/auth.py`, `backend/app/models.py` or an in-memory store, tests
- **Task:** Failed logins are logged but not limited. After 5 failed attempts for the same email
  within 15 minutes, return `429 Too Many Requests` with a clear message until the window passes.
  **Discuss the design in the issue first** (in-memory vs database, per-IP vs per-email).
- **Done when:** brute-force attempts are blocked, a successful login is unaffected, and tests cover it.

---

## 💡 Have your own idea?

Great! Open a **Feature request** issue describing the problem and your proposed solution, and wait
for a maintainer's 👍 before building it. Bug reports are just as valuable as code. If something
breaks while you're working, report it.
