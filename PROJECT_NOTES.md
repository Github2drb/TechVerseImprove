# DRB TechVerse Controls Dashboard — Project Notes

> **How to use this file:** Whenever you start a NEW chat with Claude,
> copy-paste this entire file as your first message, then ask your question.
> Claude will instantly know everything about the project.

---

## What this app is

A web dashboard for the Controls Team to track projects, tasks, materials,
and engineers. Lives at: **drbtechverse.in**

- **Frontend + Backend code:** github.com/Github2drb/TechVerseImprove
- **Data storage (JSON files):** github.com/Github2drb/Controls_Team_Tracker
- **Hosting:** Render.com

---

## Key pages and what they do

| Page | File | What it does |
|---|---|---|
| Dashboard | `client/src/pages/dashboard.tsx` | Home page with widgets |
| Team Project Tracker | `client/src/pages/team-project-tracker.tsx` | Master-detail view of all projects + engineers |
| Project Roadmap | `client/src/pages/project-roadmap.tsx` | 15-phase visual timeline per project + parallel Offline Software Track |
| Project Status / Activity Log | `client/src/pages/project-status.tsx` | Daily activity tracking, has "Roadmap" link in header |
| Material Tracker | `client/src/pages/material-procurement-tracker.tsx` | BOM → PR → PO → Receipt tracking, with Excel import |
| Engineer Management | `client/src/pages/engineer-management.tsx` | Admin: add/edit engineer logins (roles: Admin / Engineer only) |
| Engineer Workspace | `client/src/components/EngineerWorkspace.tsx` | Weekly/daily task assignment widget |
| Blog | `client/src/pages/blog.tsx` | Knowledge base posts, supports embedded iframes |
| Backend routes | `server/routes.ts` | All API endpoints |
| Server entry | `server/index.ts` | Express setup, serves `/sw.js` for push notifications |

---

## Credentials
⚠️ **Do not store actual passwords in this file or any committed file** —
this notebook lives in a GitHub repo and gets read by Claude in plain text,
so anything written here is permanently visible in commit history even if
deleted later. Keep real login credentials in a password manager or a
private note instead. Engineer Management page lets admins reset any
engineer's password directly in the app if needed.

---

## ✅ Recently completed

- **Material Procurement Tracker** built — BOM/PR/PO/Receipt dates, automatic
  red overdue alerts (PR >3 days after BOM, PO >3 days after PR approval,
  Target Receipt passed without Actual Receipt), Excel import with preview,
  unsaved-changes warning when switching projects or closing tab
- **Web push notifications** set up — VAPID keys configured in Render,
  `sw.js` served inline from `server/index.ts` (not a static file, to avoid
  MIME-type issues), "Enable Notifications" button on dashboard
- **Team Project Tracker redesigned** — master-detail split panel (no more
  horizontal scroll), fixed duplicate engineer names showing on same project
- **Project Roadmap — Offline Software Track (parallel, not sequential)**:
  - PLC Logic and HMI Screens are simultaneous toggle circles (not one-after-another)
  - Offline Testing only enables once BOTH PLC and HMI are marked done
  - Whole track stays grayed out until main roadmap reaches "Electrical Design"
  - Shows "✓ Merged at Power-Up" badge once main timeline reaches "PLC Power Up Stage"
  - **Important: this is a SEPARATE parallel track, NOT part of the main
    sequential status dropdown** — do not re-insert Offline statuses into
    the main STATUS_GROUPS/PHASES list (tried this once, reverted — see below)
  - Fixed: save mutation was missing admin auth header, causing
    "Saved locally — sync failed" toast on every save
  - By design: ALL logged-in users (admin + engineers) can VIEW the offline
    track and main status on the Roadmap page — only admins can EDIT
    (toggle circles are disabled for non-admins). This matches how the main
    project status already works. If view-restriction is ever wanted, the
    offline-status GET route currently has no isAdmin check.
- **Roadmap link** restored in Project Activity Tracking page header
- Blog post embedding (iframes) supported, cover image generation workflow established
- `PROJECT_NOTES.md` workflow established (this file!)

## 🚧 Pending / To-Do
- [ ] Continue uploading filled Material Tracker BOM sheets to GitHub as they come in (ongoing habit, no code needed)
- [ ] No other open code tasks right now — check back here before starting new work

## ❌ Decided against (don't redo these)
- Adding "Project In-charge", "SCM", "HR" roles to Engineer Management — declined, keeping just Admin/Engineer
- Putting Offline PLC/HMI/Robotic Logic into the main sequential status dropdown — tried once, reverted; the PARALLEL track on the Roadmap page is the correct, permanent design

## ⚠️ Known issues / things to watch
- **Stray JSX outside a function = blank page.** Happened twice (dashboard.tsx,
  App.tsx) when a `<Route>` or `<Link>` line got pasted at the top level of a
  file instead of inside the component's return statement. Always check that
  every JSX tag is inside a `return (...)`.
- **Components defined INSIDE other components break inputs.** If a helper
  function/component is declared inside the main component's body, React
  recreates it every render and remounts it — inputs lose focus after 1
  character. Always define helper components at the top level of the file.
- **`package.json` JSON syntax errors** (missing/extra commas) caused 2 build
  failures. Double-check JSON validity after any manual edit.
- **`import.meta.url` crashes in CJS bundles.** Don't use
  `fileURLToPath(import.meta.url)` / `__dirname` patterns in `server/index.ts`
  — the server builds as `.cjs` and this throws at runtime.
- GitHub token for `Controls_Team_Tracker` needs **Contents: Read and write**
  permission (classic token with full `repo` scope is safest) — has expired
  before, causing 503 "GitHub token invalid" errors on save.

---

## How I (the user) usually ask for help
- I paste the current file content + describe what's wrong/what I want changed
- I'm comfortable with GitHub web editor (no local git setup)
- I deploy via Render, which auto-builds on every GitHub commit
- I test on both desktop browser and mobile (Android Chrome)

---

*Last updated: 2026-06-25 (v2 — removed plaintext password, fixed offline-status save auth bug)*
