# Contributing Guide

Thanks for contributing! 🎉 This guide assumes **no prior open-source experience**. Follow it top to
bottom and you'll end up with a real pull request (PR) on a real product.

**The whole flow at a glance:**

```
 Fork on GitHub ─► Clone to laptop ─► Create a branch ─► Make a change ─► Test it
        ─► Commit ─► Push to your fork ─► Open a Pull Request ─► Review ─► Merged 🎉
```

---

## Contents

- [Key words in 60 seconds](#key-words-in-60-seconds)
- [Step 0: One-time setup](#step-0--one-time-setup)
- [Step 1: Fork and clone](#step-1--fork-and-clone)
- [Step 2: Run the project](#step-2--run-the-project)
- [Step 3: Pick an issue](#step-3--pick-an-issue)
- [Step 4: Create a branch](#step-4--create-a-branch)
- [Step 5: Make your change](#step-5--make-your-change)
- [Step 6: Test your change](#step-6--test-your-change)
- [Step 7: Commit](#step-7--commit)
- [Step 8: Push and open a Pull Request](#step-8--push-and-open-a-pull-request)
- [Step 9: Respond to review](#step-9--respond-to-review)
- [Keeping your fork up to date](#keeping-your-fork-up-to-date)
- [Coding guidelines](#coding-guidelines)
- [Common Git problems and fixes](#common-git-problems-and-fixes)
- [For workshop organisers](#for-workshop-organisers)

---

## Key words in 60 seconds

| Word | Meaning |
|---|---|
| **Repository (repo)** | A project folder tracked by Git, including its full history |
| **Upstream** | The original repo you're contributing to |
| **Fork** | Your own copy of the upstream repo, on your GitHub account |
| **Clone** | Downloading a repo to your computer |
| **Branch** | A separate line of work, so your change doesn't mix with others |
| **Commit** | A saved snapshot of your changes, with a message |
| **Push** | Uploading your commits to GitHub |
| **Pull Request (PR)** | A request asking the maintainers to merge your branch into upstream |
| **Issue** | A bug report, idea or task, tracked on GitHub |
| **Maintainer** | Someone who reviews and merges PRs |

## Step 0: One-time setup

1. Create a free account at [github.com](https://github.com/).
2. Install [Git](https://git-scm.com/downloads), [Python 3.10+](https://www.python.org/downloads/) and
   [Node.js 20+](https://nodejs.org/).
3. Tell Git who you are (use the **same email as your GitHub account**):

   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

4. **Authentication:** the first time you push, GitHub asks you to sign in. The easiest route is
   [GitHub CLI](https://cli.github.com/) (`gh auth login`), or Git Credential Manager, which ships
   with Git for Windows and opens a browser login. GitHub no longer accepts your account password
   on the command line.

## Step 1: Fork and clone

1. On this repo's GitHub page, click **Fork** (top right), then **Create fork**.
   You now have `https://github.com/<your-username>/CRM_Product`.
2. Clone **your fork** (not the upstream) to your computer:

   ```bash
   git clone https://github.com/<your-username>/CRM_Product.git
   cd CRM_Product
   ```

3. Connect your clone to the upstream repo, so you can pull in other people's changes later:

   ```bash
   git remote add upstream https://github.com/<upstream-owner>/CRM_Product.git
   git remote -v
   ```

   Replace `<upstream-owner>` with the account or organisation that owns the original repo (it's in
   the URL of the page you forked from). `git remote -v` should now list both remotes:

   ```
   origin    https://github.com/<your-username>/CRM_Product.git   ← your fork
   upstream  https://github.com/<upstream-owner>/CRM_Product.git  ← the original
   ```

## Step 2: Run the project

Follow **[README.md → Quick start](README.md#quick-start)**. Before changing anything, check that:

- http://localhost:8766/docs shows the API docs, and
- http://localhost:8765 lets you log in as `admin@crm.local` / `Admin@123`.

Take a few minutes to click around as an Admin and as a Manager (`amit@crm.local` / `Manager@123`).
Knowing the product makes it much easier to change it.

## Step 3: Pick an issue

1. Browse [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md) or the **Issues** tab (filter by the
   `good first issue` label).
2. **Comment on the issue** ("I'd like to work on this"), then wait for a maintainer to assign it to
   you. This stops two people doing the same work.
3. Found a bug or have an idea that isn't listed? **Open a new issue first**, using the templates, and
   describe it before you write code.

> One issue → one branch → one PR. Small PRs get reviewed and merged much faster.

## Step 4: Create a branch

Never work directly on `master`. Create a branch named after your change:

```bash
git checkout master
git pull upstream master          # start from the latest code
git checkout -b feat/lead-search-shortcut
```

Branch name prefixes:

| Prefix | Use for | Example |
|---|---|---|
| `feat/` | New feature | `feat/not-found-page` |
| `fix/` | Bug fix | `fix/followup-timezone` |
| `docs/` | Documentation only | `docs/add-screenshots` |
| `test/` | Adding tests | `test/tags-crud` |
| `refactor/` | Code cleanup, no behaviour change | `refactor/format-helpers` |

## Step 5: Make your change

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to see which files matter for your change.
- Keep the change **focused**. Don't reformat unrelated files or rename things you didn't need to.
- Follow the [coding guidelines](#coding-guidelines) below.
- Check your progress with:

  ```bash
  git status        # which files changed
  git diff          # exactly what changed
  ```

## Step 6: Test your change

Run all of these before committing. CI runs the same checks on your PR.

```bash
# Backend, from backend/
.venv\Scripts\python -m pytest tests -q     # Windows
.venv/bin/python -m pytest tests -q         # macOS / Linux

# Frontend, from frontend/
npx tsc --noEmit
npm run build
```

Then **test it by hand in the browser**: click through the feature you touched, as Admin and as a
Manager if permissions matter. Check a narrow (mobile) window too. Your browser's DevTools device
toolbar is handy for this.

If you changed backend behaviour, **add or update a test** in `backend/tests/`.

## Step 7: Commit

```bash
git add path/to/changed-file.tsx          # stage specific files (prefer this over "git add .")
git commit -m "feat: add / keyboard shortcut to focus lead search"
```

We use short [Conventional Commits](https://www.conventionalcommits.org/)-style messages:

```
<type>: <what changed, in the imperative, lowercase, no full stop>
```

| Type | When |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `test` | Tests only |
| `refactor` | Code change that isn't a fix or feature |
| `style` | Formatting only |
| `chore` | Tooling, dependencies, config |

✅ `fix: show error when CSV import has no header row`
❌ `fixed stuff`, `update`, `changes final v2`

## Step 8: Push and open a Pull Request

1. Push your branch to **your fork**:

   ```bash
   git push -u origin feat/lead-search-shortcut
   ```

2. Open your fork on GitHub. A yellow banner shows **"Compare & pull request"**. Click it.
   (Or: **Pull requests → New pull request**.)
3. Check the target: **base repository** = upstream, **base** = `master`; **head repository** = your
   fork, **compare** = your branch.
4. Fill in the PR template:
   - A clear title, e.g. `feat: add / keyboard shortcut to focus lead search`
   - `Closes #<issue-number>`, so the issue closes automatically when the PR merges
   - What you changed and **how you tested it**
   - **Screenshots** for any UI change (before/after)
5. Click **Create pull request**.

## Step 9: Respond to review

A maintainer will review your PR and may ask for changes. That's normal, and it's how everyone
learns, including experienced developers.

- Make the requested changes **on the same branch**, then commit and push again:

  ```bash
  git add <files>
  git commit -m "fix: address review comments"
  git push
  ```

  The PR updates automatically. Don't open a new PR.
- Reply to each comment, or mark it resolved, so the reviewer knows it's handled.
- If CI fails, click **Details** next to the failed check, read the log, fix the problem and push again.

When it's approved and merged, you're officially an open-source contributor. 🎉

## Keeping your fork up to date

Other PRs get merged while you work. To bring your branch up to date:

```bash
git checkout master
git pull upstream master          # get the latest upstream code
git push origin master            # keep your fork's master in sync

git checkout feat/your-branch
git merge master                  # bring those changes into your branch
# fix any conflicts, then:
git push
```

## Coding guidelines

### General

- Match the style of the code around you: naming, comment density, file layout.
- No secrets, API keys, personal data or `.env` files in commits.
- Don't commit generated files: `node_modules/`, `.next/`, `.venv/`, `crm.db`, `__pycache__/`.
- Write user-facing text in plain, friendly English.

### Backend (Python / FastAPI)

- Put new endpoints in the router that matches the area (`routers/leads.py`, `routers/users.py`, ...).
  If you create a new router file, register it in `app/main.py`.
- Validate input with **Pydantic schemas** in `schemas.py`. Don't read raw request bodies.
- Protect endpoints with the dependencies in `security.py`:
  - `Depends(get_current_user)`: any logged-in user
  - `Depends(require_perm("leads.edit"))`: needs a specific permission (see `PERMISSIONS` in `models.py`)
  - `Depends(require_admin)`: admins only
- Managers without `leads.view_all` must only see **their own** leads. Keep that scoping when you add
  queries.
- Record important actions with `log_activity(...)` from `services.py`, so they appear in the audit log.
- Use `HTTPException(status_code, "Human-readable message")` for errors. The frontend shows the
  message to the user.
- Timestamps are naive UTC (`models.utcnow()`).
- Changing a model? There are no migrations yet. Delete `crm.db` or run `python -m app.seed --reset --demo`
  locally, and mention the schema change in your PR.

### Frontend (Next.js / TypeScript)

- Pages live in `src/app/(app)/<page>/page.tsx`; reusable pieces go in `src/components/`.
- Reuse existing UI parts from `components/ui.tsx` (`Modal`, `Badge`, `Dropdown`, `Empty`, `PageHeader`,
  `useToast`, ...) and the CSS classes in `globals.css` (`btn`, `input`, `card`, ...) before writing
  new ones.
- Call the API through `api()` in `lib/api.ts`. It adds the token and turns errors into readable messages.
- Add or update response types in `lib/types.ts`. Avoid `any` in new code.
- Icons come from [`lucide-react`](https://lucide.dev/icons/).
- Every screen must work on **mobile**. Check it at ~375px wide.

## Common Git problems and fixes

| Problem | Fix |
|---|---|
| I committed to `master` by mistake | `git checkout -b feat/my-change` (your commit comes with you), then `git checkout master && git reset --hard upstream/master` |
| Merge conflict | Open the file, look for `<<<<<<<` / `=======` / `>>>>>>>`, keep the right code, delete the markers, then `git add <file>` and `git commit` |
| Wrong commit message (not pushed yet) | `git commit --amend -m "better message"` |
| I want to undo changes to a file | `git restore path/to/file` (this discards your edits to that file) |
| `Permission denied` / `403` on push | You're pushing to upstream instead of your fork. Check with `git remote -v` and push to `origin` |
| `rejected: non-fast-forward` on push | Run `git pull origin <your-branch>` first, then push again |

## For workshop organisers

A suggested 2–3 hour session:

| Time | Activity |
|---|---|
| 0:00 | Intro: what open source is, and a tour of the CRM |
| 0:20 | Everyone does Steps 0–2 (setup, fork, clone, run). Helpers walk the room |
| 0:50 | Students claim issues from `docs/GOOD_FIRST_ISSUES.md` (one per student or pair) |
| 1:00 | Build and test (Steps 4–6) |
| 1:50 | Commit, push, open PRs (Steps 7–8) |
| 2:10 | Live review of a few PRs on the projector, then merge |

Tips:

- Before the workshop, create a GitHub issue for each task in `docs/GOOD_FIRST_ISSUES.md` and label
  them `good first issue` plus `easy`, `medium` or `hard`.
- Ask students to comment on an issue to claim it, and assign it to them so no one duplicates work.
- The `docs:` tasks are good for participants without a working dev environment.
- Merge PRs one at a time. Later PRs may need `git merge master`, which is good practice for students too.

---

Questions? Open an issue with the **question** label. Thanks for helping make this project better! 💙
