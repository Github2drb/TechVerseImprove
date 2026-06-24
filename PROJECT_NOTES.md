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

✅ Recently completed (add to top of this section)


New roles: HR, Project In-Charge (PIC), SCM — added alongside Admin/Engineer
in Engineer Management.

These three roles get full read access everywhere in the app — same as
Admin sees, just view-only (Engineer Management page now shows for them
instead of "Access Denied", but Add/Edit/Delete/Sync buttons stay
Admin-only).
Exception: Material Procurement Tracker — HR/PIC/SCM (and Admin) CAN
edit here. This is the one place they're allowed to write data.
Implementation: x-admin-auth header now carries the real role for every
logged-in user (previously it was only sent for Admin — a latent bug
where non-admins were silently treated as logged out on protected
calls). Server has two new helper checks: isFullAccessViewer() (read
gate) and canEditMaterials() (write gate for the tracker), separate
from the strict isAdmin() used everywhere else.
Decided against (superseded): the old note above about declining
"Project In-charge / SCM / HR roles" — that decision is now reversed
per explicit request. Don't revert this without checking with the user.



Material Procurement Tracker — overdue visibility

Each material's Target Receipt now shows a live "X days left" / "Overdue
by X days" / "Due today" label, not just a red border.
Added a dedicated "Materials Overdue for Receipt" table (name, qty,
target date, days overdue, notes) that appears under the alert summary
whenever the selected project has overdue items. Scoped per-project,
matching the page's existing one-project-at-a-time design — switching
the project selector switches this table too.



Engineer Daily Reports — clearer pending tasks

Target Tasks are now split into two visually distinct groups: Pending —
To Be Done (red, shown first) and Target Tasks — Done (struck
through), instead of one flat list with no done/pending signal.
"Done" is inferred by fuzzy-matching each target task's text against
that engineer's Completed Activities for the day (the two lists aren't
linked by id in the data, so this is a best-effort match, not a stored
field).
Added a page-level banner: "X tasks pending across the team today" (or
a "All target tasks done 🎉" message when there's nothing outstanding).



Fixed a pre-existing build-breaking bug in
client/src/components/ui/sidebar.tsx — a stray, orphaned object literal
(looked like an accidentally pasted nav-link snippet) was sitting outside
any function and breaking tsc/npm run check for the entire repo.
Removed it; unrelated to anything in this session's work but worth noting
in case anyone wonders why a sidebar file changed.


⚠️ Known issues / things to watch (add to this section)


HR/PIC/SCM "done" tasks in Engineer Daily Reports are inferred by text
matching, not a real per-task status field. If task wording in
"Completed Activities" doesn't resemble the "Target Tasks" wording, a
finished task may still show as Pending. A more durable fix would be
adding a done: boolean field directly on each target task (set via a
checkbox where Admin enters them) instead of inferring it — flagged here
in case this becomes annoying in practice.
The "Materials Overdue for Receipt" table only covers the currently
selected project (matches the page's existing per-project view). If a
combined "overdue across ALL projects at once" view is ever wanted, that
needs a new endpoint that loads every tracked project's materials in one
call — the current architecture lazy-loads one project at a time.

---

## How I (the user) usually ask for help
- I paste the current file content + describe what's wrong/what I want changed
- I'm comfortable with GitHub web editor (no local git setup)
- I deploy via Render, which auto-builds on every GitHub commit
- I test on both desktop browser and mobile (Android Chrome)

---

*Last updated: 2026-06-25 (v2 — removed plaintext password, fixed offline-status save auth bug)*
