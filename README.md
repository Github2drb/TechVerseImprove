# TechVerse Improve — Controls Team Tracker

A full-stack web application for managing engineering team daily tasks, project assignments, weekly plans, skill matrix, and analytics. Built with React + Express + TypeScript.

---

## 🚀 Quick Deploy to Render.com (Free)

### Step 1 — Push this repository to your GitHub account

Upload this folder to a new GitHub repository under your account `Github2drb`.

### Step 2 — Create a GitHub Personal Access Token (PAT)

1. Go to **GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set **Repository access** → Select only `Controls_Team_Tracker`
4. Under **Permissions → Contents** → Set to **Read and Write**
5. Generate and **copy the token** (you won't see it again)

### Step 3 — Deploy on Render.com

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub account and select this repository
4. Render will auto-detect `render.yaml` settings
5. In **Environment Variables**, add:
   - `GITHUB_TOKEN` → paste your PAT from Step 2
6. Click **Deploy**

Your app will be live at a URL like `https://techverse-improve.onrender.com`

---

## 🛠 Local Development

### Prerequisites
- Node.js 20+
- npm

### Setup

```bash
# Install dependencies
npm install

# Copy environment file and fill in your GITHUB_TOKEN
cp .env.example .env
# Edit .env and set GITHUB_TOKEN=your_token_here

# Start development server
npm run dev
```

App will be available at `http://localhost:5000`

### Build for Production

```bash
npm run build
npm run start
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | ✅ Yes | GitHub Personal Access Token with Contents read/write on `Controls_Team_Tracker` repo |
| `MICROSOFT_ACCESS_TOKEN` | ❌ Optional | Microsoft access token for SharePoint integration |
| `PORT` | ❌ Optional | Server port (default: 5000) |
| `NODE_ENV` | ❌ Optional | `production` or `development` |

---

## 📁 Data Storage

All application data is stored as JSON files in the **`Controls_Team_Tracker`** GitHub repository under `Github2drb`:

| File | Contents |
|---|---|
| `data.json` | Project assignments and engineer data |
| `daily-activities.json` | Engineer daily completed activities |
| `engineers_master_list.json` | Master list of all engineers |
| `engineer-daily-tasks.json` | Engineer task configuration |
| `engineers_auth.json` | Login credentials (username/hashed passwords) |
| `project-status.json` | Per-project status tracking |
| `project-activities.json` | Project activity log |
| `weekly-assignments.json` | Weekly engineer assignments |

> Make sure the `Controls_Team_Tracker` repository exists under `Github2drb` before running the app.

---

## 🏗 Architecture

```
TechVerseImprove/
├── client/          # React frontend (Vite + Tailwind + shadcn/ui)
├── server/          # Express backend (TypeScript)
│   ├── github.ts    # GitHub API integration (data storage)
│   ├── routes.ts    # All API routes
│   ├── storage.ts   # In-memory fallback storage
│   └── static.ts    # Static file serving
├── shared/          # Shared TypeScript types/schema
└── script/          # Build scripts
```

---

## 🔐 Default Login Credentials

| Username | Password | Role |
|---|---|---|
| `admin` | `admin@drb` | Admin |
| *(engineer name)* | `drb@123` | Engineer |

Change these after first login via the Engineer Management page.

--

## ⚠️ Notes

- The free tier on Render.com **spins down** after 15 minutes of inactivity. First load after inactivity may take ~30 seconds.
- Upgrade to a paid Render plan to keep the server always-on.
- SharePoint integration requires a valid Microsoft access token and is optional.
