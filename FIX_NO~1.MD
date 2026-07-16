# TechVerseImprove — Snyk Vulnerability Fixes (2026-07-16)

All 13 files are complete, ready-to-upload replacements. Upload each to the **same path** in `Github2drb/TechVerseImprove` via the GitHub web editor. Render will auto-deploy.

## What was fixed

| # | Snyk finding | Severity | File(s) | Fix |
|---|---|---|---|---|
| 1 | XSS — request URL flows into `res.end` (CWE-79) | **High** | `server/vite.ts` | Only the decoded pathname is passed to `transformIndexHtml`; query/fragment stripped |
| 2 | Hardcoded passwords (`admin@drb`, `drb@123`) | Low ×16 | `server/routes.ts`, `server/server_routes.ts`, `client/src/pages/routes.ts` | Replaced with `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_ENGINEER_PASSWORD` env vars (random fallback) |
| 3 | Hardcoded seed passwords (`admin123`…) | Low | `server/storage.ts` | `SEED_ADMIN_PASSWORD` / `SEED_MANAGER_PASSWORD` / `SEED_MEMBER_PASSWORD` env vars (random fallback) |
| 4 | Hardcoded fallback admin credentials in client bundle | Low | `client/src/pages/blog.tsx`, `client/src/pages/notifications.tsx` | Fallback creds removed — if the auth file can't load, admin login is unavailable |
| 5 | Hardcoded client admin password `drb2024` | Low | `client/src/components/EngineerTracker.tsx` | `VITE_TRACKER_ADMIN_PASSWORD` env var; empty value can never unlock |
| 6 | Hardcoded session secret | Medium | `server/index.ts` | `SESSION_SECRET` env var, per-boot random fallback |
| 7 | Insecure randomness (`Math.random` for IDs) | Medium ×14 | `server/routes.ts`, `server/server_routes.ts`, `server/syncDailyTasks.ts`, `client/src/pages/routes.ts`, `NotifBell.tsx`, `notifications.tsx`, `material-procurement-tracker.tsx` | `crypto.randomUUID()` (server) / `crypto.getRandomValues()` (client) |
| 8 | Stored XSS via blog HTML (`dangerouslySetInnerHTML`) | Medium | `client/src/pages/blog.tsx` | Content sanitized with DOMPurify |
| 9 | Framework fingerprint (`X-Powered-By`) | Low | `server/index.ts` | `app.disable("x-powered-by")` |
| 10 | New dependency for fix #8 | — | `package.json` | Added `dompurify` + `@types/dompurify` (JSON validated) |

## Required Render environment variables (set BEFORE deploying)

Without these, no committed password works anymore (that's the point) — set them to keep current behavior:

- `SESSION_SECRET` — any long random string
- `DEFAULT_ADMIN_PASSWORD` — replaces `admin@drb` fallback (auto-created admin account)
- `DEFAULT_ENGINEER_PASSWORD` — replaces `drb@123` (auto-created engineer accounts)
- `VITE_TRACKER_ADMIN_PASSWORD` — replaces `drb2024` (EngineerTracker admin unlock)
- `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_MEMBER_PASSWORD` — only if you use the in-memory seed users (admin/manager/member)

Store the actual values in your password manager, never in the repo.

## Upload checklist (GitHub web editor)

1. `package.json` → repo root
2. `server/vite.ts`, `server/index.ts`, `server/storage.ts`, `server/routes.ts`, `server/server_routes.ts`, `server/syncDailyTasks.ts` → `server/`
3. `client/src/pages/blog.tsx`, `notifications.tsx`, `routes.ts`, `material-procurement-tracker.tsx` → `client/src/pages/`
4. `client/src/components/EngineerTracker.tsx`, `NotifBell.tsx` → `client/src/components/`
5. Set the env vars above in Render → Manual redeploy → re-run Snyk scan

## Not fixed (needs a design decision — flag for later)

- **Passwords stored/compared in plaintext** in `engineers_auth.json` (bcrypt is already wired in `server/routes.ts` for `$2…` hashes — new passwords are hashed; old plaintext entries still work until rotated).
- **`blog.tsx` / `notifications.tsx` fetch the full `engineers_auth.json` (including passwords) into the browser** from the public raw GitHub URL. Client-side login against that file is fundamentally exposed; the right fix is to log in via `POST /api/auth/login` instead. Happy to do this as a follow-up.

## Verification performed

- esbuild syntax check passed on all 12 TS/TSX files
- `package.json` validated as strict JSON
- Zero remaining hardcoded-password or `Math.random()` ID patterns in the repo
