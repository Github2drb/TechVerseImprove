# DRB TechVerse Controls Dashboard — Project Context

> This file is auto-loaded by Claude Code / Claude Cowork from the repo root.
> No need to paste it into chat — just open this project in Cowork.
> Keep this updated after significant sessions; treat it as the single source
> of truth instead of scattering context across old chat threads.

---

## What this app is

A full-stack web dashboard for an industrial automation **Controls Team** —
tracks projects, engineer daily activity, material procurement, analytics,
notifications, and an internal knowledge-base blog.

- **Live site:** drbtechverse.in (hosted app: `controls-dashboard-1.onrender.com`)
- **Frontend + backend code:** github.com/Github2drb/TechVerseImprove
- **Data storage (JSON files):** github.com/Github2drb/Controls_Team_Tracker
- **Hosting:** Render.com (auto-deploys on every GitHub commit — no local git setup, user edits via GitHub web editor)

## Role

Dedicated dev assistant for this app. Read, modify, and write React/TypeScript
frontend files and Express/TypeScript backend files. Deliver code that
compiles first time — no silent errors. When the user pastes a file, treat it
as the current live version and work from it.

---

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Wouter (routing)
- **Backend:** Express.js, TypeScript, Node.js
- **Data:** JSON files in the `Controls_Team_Tracker` GitHub repo, read/written via GitHub API (needs a `GITHUB_TOKEN` with **Contents: Read and write**, classic token with full `repo` scope is safest — has expired before, causing 503 "GitHub token invalid" errors)
- **Key libraries:** xlsx (SheetJS), html2pdf.js, web-push, date-fns, lucide-react, recharts, framer-motion

---

## Key pages

| Page | File | What it does |
|---|---|---|
| Dashboard | `client/src/pages/dashboard.tsx` | Home page with widgets |
| Team Project Tracker | `client/src/pages/team-project-tracker.tsx` | Master-detail view of all projects + engineers |
| Project Roadmap | `client/src/pages/project-roadmap.tsx` | 15-phase visual timeline per project + parallel Offline Software Track (PLC Logic + HMI Screens as independent toggles, merging into Offline Testing, which merges back at Equipment Power-Up) |
| Project Status / Activity Log | `client/src/pages/project-status.tsx` | Daily activity tracking; 7 status types incl. Partially Started/Completed, Waiting for Customer Approval; "Roadmap" link in header |
| Analytics Dashboard | (project status Excel view) | Reads live Excel file from GitHub via backend proxy (see Critical rules) |
| Material Tracker | `client/src/pages/material-procurement-tracker.tsx` | BOM → PR → PO → Receipt tracking, Excel import, live "days left / overdue" labels, dedicated "Materials Overdue for Receipt" table (per-project scope) |
| Engineer Management | `client/src/pages/engineer-management.tsx` | Admin: add/edit engineer logins. Roles: **Admin, Engineer, HR, Project In-Charge (PIC), SCM** |
| Engineer Workspace | `client/src/components/EngineerWorkspace.tsx` | Weekly/daily task assignment widget |
| Engineer Daily Reports | (daily report data) | Monthly calendar grid, 19 engineers, statuses: Office/Site Visit/CL/C-Off/EL/FH/WP+/WFH/Leave/RH; Target Tasks split into Pending (red) vs Done (struck-through) via fuzzy text match; page banner shows count of pending tasks team-wide |
| Blog / Knowledge Base | `client/src/pages/blog.tsx` | Admin create/edit/delete posts, HTML content, categories/tags/cover images/pin/draft, supports embedded iframes; images in `Controls_Team_Tracker/blog-images/` |
| Notifications | (notifications page) | Bell icon + unread count in header; admin sends info/success/warning/alert with links; web-push via VAPID keys + service worker |
| Backend routes | `server/routes.ts` | All API endpoints |
| Server entry | `server/index.ts` | Express setup; serves `/sw.js` for push notifications |

### Roles & permissions model
- **Admin, HR, Project In-Charge (PIC), SCM** — full read access everywhere (HR/PIC/SCM are view-only by default)
- **Material Procurement Tracker is the one exception** — HR/PIC/SCM (and Admin) can also *edit* here
- Server-side: `x-admin-auth` header carries the real role for every logged-in user (previously only sent for Admin — fixed a bug where non-admins were silently treated as logged out on protected calls)
- Two helper checks: `isFullAccessViewer()` (read gate) and `canEditMaterials()` (write gate for the tracker), separate from the strict `isAdmin()` used elsewhere
- Admin login source of truth: `engineers_auth.json`

---

## Critical rules — always follow

1. **Never define a component inside another component's body.** It gets recreated every render → React remounts it → inputs lose focus after 1 character. Always define helper components at the top level of the file.
2. **Never leave JSX outside a function.** A stray `<Route>`, `<Link>`, or any JSX tag (or an orphaned object literal — happened once in `sidebar.tsx`) sitting outside any function at the top level = blank white page on load or a build-breaking `tsc`/`npm run check` failure across the whole repo.
3. **`package.json` is strict JSON.** Missing commas (e.g. after adding `web-push` or `html2pdf.js`) have caused build failures more than once — double-check after manual edits.
4. **`/sw.js` (service worker) must be registered as its own Express route, placed AFTER `const app = express()` but BEFORE the SPA wildcard route**, or the wildcard intercepts it and returns `index.html` instead of the JS file (breaks push notifications). Serve it inline from the server with `Content-Type: application/javascript; charset=utf-8`.
5. **GitHub API calls from the browser hit CORS + rate limits** (unauthenticated = 60 req/hour). Proxy any GitHub-file reads (e.g. the Analytics Excel file) through the backend, which holds `GITHUB_TOKEN`, instead of calling GitHub directly from the frontend.
6. **Backend admin-only routes need the 4th `apiRequest` param set to `true`** to send the `x-admin-auth` header — forgetting it causes silent 403s that show up as confusing "sync failed" toasts.
7. **Never put real passwords/credentials in this file or any committed file.** It lives in a public-to-the-team GitHub repo and stays in commit history forever even after deletion. Use a password manager; Engineer Management page lets admins reset passwords directly in-app.
8. **`vite.config.ts` build.cssMinify should be `'esbuild'`** — default minifier has produced malformed chained `::after::before` selectors in production CSS.
9. **html2canvas blank-capture trap:** never position an element to be screenshotted off-screen (e.g. `position:fixed; left:-99999px`) — frequently returns a blank canvas. Render it on-screen (even briefly, behind an overlay) instead.

---

## Security posture (Snyk fixes applied 2026-07-16)

All hardcoded passwords, insecure randomness, one stored-XSS hole, and the `X-Powered-By` fingerprint were fixed across 13 files. Details:

- **No credentials are hardcoded anymore.** Admin/engineer/seed passwords now come from env vars only (`DEFAULT_ADMIN_PASSWORD`, `DEFAULT_ENGINEER_PASSWORD`, `VITE_TRACKER_ADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_MEMBER_PASSWORD`) with random fallbacks — **these must be set in Render**, or auto-created accounts get an unpredictable random password instead of the old known ones.
- **`SESSION_SECRET`** is now an env var (random fallback per boot) — set it in Render or sessions won't survive restarts consistently.
- **IDs use `crypto.randomUUID()` / `crypto.getRandomValues()`**, not `Math.random()`, across routes, sync jobs, and notification/material-tracker components.
- **Blog HTML is sanitized with DOMPurify** before `dangerouslySetInnerHTML` — don't remove this when touching `blog.tsx`.
- **`X-Powered-By` header is disabled** in `server/index.ts`.
- **Any new hardcoded credential, new `Math.random()`-based ID, or new raw `dangerouslySetInnerHTML` is a regression of this fix** — flag it if it comes up again in a future session.

### Not yet fixed — known open items
- **`engineers_auth.json` passwords are plaintext for any account not yet rotated.** bcrypt is wired into `server/routes.ts` for `$2…`-prefixed hashes, so new/reset passwords hash correctly, but old plaintext entries still work until someone resets them.
- **`blog.tsx` and `notifications.tsx` currently fetch the entire `engineers_auth.json` (including passwords) into the browser** from the public raw GitHub URL to do client-side login checks. This is fundamentally exposed. The real fix is moving login to `POST /api/auth/login` server-side instead of checking credentials in the browser — **do this before any other auth work**, since it's the biggest remaining hole.

---

## Known issues / things to watch

- **Task "done" detection in Engineer Daily Reports is fuzzy text-matching**, not a real stored field — if wording differs between "Target Tasks" and "Completed Activities," a finished task can still show as Pending. A more durable fix: add a `done: boolean` field directly on each target task (checkbox at entry time) instead of inferring it.
- **"Materials Overdue for Receipt" table is scoped to the currently selected project only**, matching the page's one-project-at-a-time design. A combined "overdue across ALL projects" view would need a new endpoint that loads every project's materials at once (current architecture lazy-loads per project).

---

## How the user works

- Pastes current file content + describes what's wrong / what they want changed
- Comfortable with GitHub web editor — no local git setup
- Deploys via Render, which auto-builds on every GitHub commit
- Tests on desktop browser and Android Chrome mobile
- Pastes Render build/runtime logs or screenshots when something breaks

---

*Consolidated from PROJECT_INSTRUCTIONS.md + PROJECT_NOTES.md (v2, 2026-06-25) plus prior chat history. Last updated: 2026-07-25.*
