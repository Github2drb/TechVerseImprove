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
| Project Roadmap | `client/src/pages/project-roadmap.tsx` | 18-phase visual timeline per project |
| Project Status / Activity Log | `client/src/pages/project-status.tsx` | Daily activity tracking |
| Material Tracker | `client/src/pages/material-procurement-tracker.tsx` | BOM → PR → PO → Receipt tracking |
| Engineer Management | `client/src/pages/engineer-management.tsx` | Admin: add/edit engineer logins |
| Engineer Workspace | `client/src/components/EngineerWorkspace.tsx` | Weekly/daily task assignment widget |
| Blog | `client/src/pages/blog.tsx` | Knowledge base posts |
| Backend routes | `server/routes.ts` | All API endpoints |

---

## Known passwords
- Admin: `admin` / `admin@drb`

---

## ✅ Recently completed
- Material Procurement Tracker built (BOM/PR/PO/Receipt dates, red alerts, Excel import)
- Web push notifications set up (VAPID keys configured in Render)
- Added "Offline Logic Development" status group (PLC/HMI/Robotic) between
  Design&Procurement and Assembly&Installation — in team-project-tracker.tsx,
  project-status.tsx, and project-roadmap.tsx
- Fixed master-detail split panel on Team Project Tracker (no more horizontal scroll)
- Fixed duplicate engineer names showing on same project in tracker

## 🚧 Pending / To-Do
- [ ] Decide: remove the old "parallel Offline Software Track" widget on
      Project Roadmap page now that Offline Logic is in the main sequence?
- [ ] Add 3 new roles to Engineer Management: Project In-charge, SCM, HR
      (need to confirm: should any of these get admin-level access?)
- [ ] Upload filled Material Tracker BOM sheets to GitHub as they come in

## ⚠️ Known issues / things to watch
- When pasting React component code, NEVER let stray JSX sit outside a
  function — caused 2 blank-page bugs before (dashboard.tsx, App.tsx)
- Component functions defined INSIDE other components cause inputs to lose
  focus after 1 character — always define helper components at the top level
- `package.json` JSON syntax errors (missing commas) caused build failures
  twice — double check after manual edits

---

## How I (the user) usually ask for help
- I paste the current file content + describe what's wrong/what I want changed
- I'm comfortable with GitHub web editor (no local git setup)
- I deploy via Render, which auto-builds on every GitHub commit

---

*Last updated: [DATE] — update this line each time you edit this file*
