# ThirtyMilestones Dashboard — Complete Documentation

> Ye file poore project ka single source of truth hai. Isse padhne ke baad
> aapko pata chal jayega ki ye dashboard kya hai, kaise kaam karta hai, kaunse
> features hain, tech stack kya hai, database/API structure kaisa hai, aur
> deployment kaise hota hai.

---

## 1. Project kya hai (Overview)

Ye ek **internal company operations dashboard** hai — "ThirtyMilestones" naam
se — jisme task management, checklist automation, attendance, employee
performance scoring, multi-step workflow tracking, Google Forms response
viewer, IT/HR help-tickets aur inventory management (IMS) sab ek jagah hai.

**Tech stack summary:**

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4 |
| Backend | Node.js + Express + TypeScript (separate app in `/backend`) |
| Database | Supabase (Postgres) — primary. Google Sheets — legacy/secondary (Forms feature + backups) |
| Auth | Custom JWT (no third-party auth provider), bcrypt password hashing |
| Deployment | Backend → Render.com (`render.yaml`). Frontend → likely Vercel (separate, not in this repo config) |
| Scheduler | `node-cron` — daily checklist generation + periodic Supabase→Sheets backup |

Frontend aur backend **do independent apps** hain jo sirf REST API (HTTP/JSON)
ke through baat karte hain — koi shared code/monorepo tooling nahi hai.

---

## 2. Repo structure (top-level)

```
dashboard-v2/
├── src/                 → Next.js frontend (App Router)
├── backend/             → Express + TypeScript API server
├── docs/                → Feature-level design docs (Forms, Scoring, Workflow PRD)
├── .github/workflows/   → backup.yml (cron pinging backend to run backup)
├── render.yaml          → Render deployment config (backend only)
├── package.json         → frontend deps
└── next.config.ts / tsconfig.json / eslint.config.mjs
```

`tsconfig.json` explicitly **excludes `backend/`** — ye do alag TypeScript
projects hain ek hi git repo ke andar.

---

## 3. Authentication & Role-Based Access Control (RBAC)

- Login `identifier` (Email **ya** Employee Code, jaise `TM01`, `AD01`) +
  `password` se hota hai. Password `bcryptjs` se verify hota hai.
- Login endpoint rate-limited hai (20 attempts / 15 min / IP).
- Successful login par JWT milta hai (default expiry `8h`), jisme role +
  **saare permission flags embed** hote hain: `role`, `canViewAll`,
  `isAttendanceManager`, `isAssistant`, `canDeleteTask`, `canManageDoers`,
  `canViewTeamPerformance`, `canEditAttendance`, `canAccessAllTasks`,
  `canAccessInventory`, `canManageWorkflow`, `canManageForms`,
  `canManageMasterSheet`.
- **Roles (3-tier):**
  - **MD** — full access, hamesha (hardcoded, non-toggleable).
  - **PC** ("deputy") — per-user configurable permission toggles (Settings
    page se on/off kiye ja sakte hain; kuch default ON, kuch default OFF).
  - **Doer** — sirf apna khud ka kaam (tasks/checklist/attendance) dekh
    sakta hai.
  - **`isAssistant`** flag — "assistant admin": almost full admin access,
    but delete-doer/delete-task jaise destructive actions **block** rehte
    hain (`forbidAssistant` middleware).
- **Important nuance:** JWT sirf signature/expiry verify karta hai; har
  request par backend **live user row DB se re-fetch** karta hai aur uske
  current permissions se `req.user` banata hai — matlab agar Settings me
  kisi ka role/permission change ho jaye, to usse turant apply ho jata hai,
  8-hour token expire hone ka wait nahi karna padta.
- Frontend token ko `localStorage` (`tm_auth_token`) me store karta hai aur
  har authenticated request me `Authorization: Bearer <token>` header
  bhejta hai (`src/lib/api.ts`).

---

## 4. Features — page-by-page (Frontend `src/app/`)

Har page `AuthGuard` + `SideNav` + `MobileHeader` wrapper me hai, aur sab
`"use client"` components hain (koi server component data-fetching nahi hai
— pura app client-side fetch pattern use karta hai).

| Route | Feature |
|---|---|
| `/` (`page.tsx`) | **Home Dashboard** — summary stats, pending/urgent/critical/overdue task sections, activity timeline, "Create Task" (incl. workflow start) modal. |
| `/login` | Login form (identifier + password). |
| `/task-list` | **My Tasks** — doer ka apna task list, revise/create modals. |
| `/all-tasks` | **All Tasks** (MD/PC-only) — org-wide tasks across sab doers/lists, reassignment, orphaned-task detection. |
| `/checklist` | Recurring checklist templates se auto-generate hue daily instances, mark-complete flow. |
| `/workflow` | **Workflow Monitoring System (WFMS)** — sabse bada page (1300+ lines). Management view (tick-chip grid) + doer ka "My Workflow" view. Template/instance create modals. |
| `/master-sheet` | Internal systems/lists ki free-form documentation table (CRUD, admin-only). |
| `/forms` | **Google Forms** response viewer — live Google Sheets se responses padhta hai (20s polling), per-form access control, status tracking, CSV export. |
| `/attendance` | Check-in/out, daily/history/range view, edit modal. |
| `/team-performance` | **DGMAX** scoreboard (negative performance scoring). |
| `/performance` | Related/personal performance detail view. |
| `/settings` | **User (Doer) Management** — create doer, lists & access management, password reset, PC permission toggles, "reassign all work". |
| `/help-ticket`, `/help-ticket/new`, `/help-ticket/[id]` | IT/HR help ticket system — list, create, detail/status update. |
| `/ims` | **Inventory Management System** — Items / Transactions / Stock Ledger / Reorder Sheet tabs. |

---

## 5. Feature deep-dives

### 5.1 Task Management
- CRUD tasks with priority, status, due date.
- Revision history: due-date change karne par purana record **overwrite nahi**
  hota, append-only revision log banta hai (`/tasks/:id/revision`).
- Doer delete ho jaye to uske tasks "orphaned" ban jaate hain — UI me
  `isOrphanedTask()` helper se detect hote hain.
- Bulk **"Reassign All Work"** — ek doer ke saare tasks + checklist templates
  ek dusre doer ko offboarding/leave ke time transfer kar sakte ho.

### 5.2 Checklist Automation
- Recurring templates (daily/weekly/monthly) se cron job (`scheduler/dailyJob.ts`)
  daily instances auto-generate karta hai + overdue flag lagata hai.
- Manual "generate" endpoint bhi hai for re-running on demand.

### 5.3 Workflow Monitoring System (WFMS) — sabse complex feature
(Full detail: `docs/workflow-prd.md`)

- Data model: **Template → Step → Instance (Run) → Step Event**.
- "Copy-on-start": jab ek instance start hota hai, template ke steps
  **copy** ho jaate hain step-events me — baad me template edit karne se
  chal rahe/complete ho chuke runs affect nahi hote.
- **TAT (Turnaround Time)** business-hours-aware cascade: 09:30–18:30 IST,
  Sunday off (koi holiday calendar nahi). Har step ka deadline pichले step
  ke actual completion se calculate hota hai.
- `Overdue` status **kabhi DB me store nahi hota** — hamesha read-time par
  `Planned` vs `now` compare karke compute hota hai.
- Rework/"send back" flow with **3-strike escalation cap**.
- Scalability trick: `GET /workflow/overview` results ko
  (workflow, step, person) se **group** karke deta hai, taaki 1000+
  backlogged runs bhi ek chhoti summary row me collapse ho jayen.
- Roles: MD full access; PC sirf `canManageWorkflow` grant hone par; Doer
  sirf apne assigned steps dekh sakta hai.
- Known limitations (by design): no parallel steps, no holiday calendar,
  no push notifications (sab kuch 60s poll-based hai), no file attachments,
  no per-run reassignment.

### 5.4 DGMAX — Employee Performance Scoring
(Full formula: `docs/SCORING_WORKFLOW.md`, engine:
`backend/src/utils/performanceScoring.ts`)

Weekly task categorization:
- **Green** = On Time, **Yellow** = Late Done (partial penalty), **Red** =
  Not Done (full penalty), **Pending** = excluded, **Exempt** = Cancelled/no
  due date.

Formulas:
```
Per Task %        = 100 / AssignedTasks          (Assigned = Green+Yellow+Red)
NotDonePenalty    = RedCount × PerTask%
LateDonePenalty   = YellowCount × PerTask% × (LateDoneWeight / 100)   [default weight = 60%, admin-configurable]
NegativeScore     = -min(100, NotDonePenalty + LateDonePenalty)
PerformanceScore  = 100 + NegativeScore
```

### 5.5 Google Forms Integration
(Full detail: `docs/FORMS.md`)

- Dashboard 10-50+ Google Forms ke responses **live read** karta hai —
  koi data DB me copy nahi hota, sirf ek pointer row Supabase table
  `form_configs` me store hoti hai (name, spreadsheet id, sheet/tab, form
  link, allowed member IDs).
- Frontend har 20 seconds me poll karta hai.
- Per-doer access control (member list) — Admin/MD sabkuch dekh sakta hai.
- CSV export, search, status tracking (Working/Complete), pagination
  (25/page).

### 5.6 Attendance
- Check-in / check-out, daily/history/range views.
- Late/early-exit/working-minutes auto-computation.
- MD-only: wipe-all aur recompute tools.
- `canMarkAttendance` / `canEditAttendance` permissions se PC ko selectively
  access diya ja sakta hai.

### 5.7 Master Sheet
- Internal systems/lists ki ek registry table — free-form documentation,
  admin-editable (`canManageMasterSheet`).

### 5.8 Help Ticket System
- IT/HR-style internal ticketing: priority, MD/PC ko route hota hai,
  solution options, status lifecycle: Pending → Waiting for Employee →
  Reopened → Completed.

### 5.9 Inventory Management System (IMS)
- SKU-based items, in/out transaction log.
- Computed **Stock Ledger** (date-wise) aur **Reorder Sheet** (MOQ/lead-time/
  safety-factor based reorder quantity report).
- Poora module `canAccessInventory` permission se gated hai.

### 5.10 Doer/User Management (Settings)
- Employee create/manage, lists aur list-based access control, password
  reset, PC ke liye granular permission toggles.

### 5.11 Backup System
- `node-cron` scheduled job Supabase data ko periodically Google Sheets me
  snapshot karta hai (`SCHEDULER_BACKUP_CRON`, default har 6 ghante).
- Render free-tier par server so jaata hai inactivity par, isliye
  `.github/workflows/backup.yml` GitHub Action har 6h me
  `POST /api/backup/run` (shared secret `x-backup-token` header ke saath)
  call karke server ko jagata hai aur backup trigger karta hai.

---

## 6. Backend architecture (`backend/src/`)

Layered structure:

```
config/       env.ts, sheets.config.ts, supabase.ts, helpers.ts
types/        shared domain types (JwtClaims, UserRole, etc.)
utils/        AppError, asyncHandler, logger (pino), tatEngine.ts,
              performanceScoring.ts / dgmaxScoring.ts, attendanceTime.ts,
              access.ts (permission logic — frontend `access.ts` ka mirror,
              manually kept in sync), listAccess.ts, response.ts
services/     ek service per domain — auth, users, tasks, checklist,
              dashboard, activity, lists, workflow, masterSheet,
              formConfig, formResponses, ticket, attendance, ims, revisions
              + googleSheets.service.ts (generic Sheets CRUD)
validation/   Zod schemas per resource
middleware/   auth (JWT verify + live user reload), role (requireRole/
              requirePermission/forbidAssistant), validate (Zod), error,
              notFound
controllers/  thin HTTP layer, ek per domain
routes/       Express routers, sab `/api` ke under mount hote hain
scheduler/    dailyJob.ts (checklist gen + overdue flag),
              backupJob.ts (Supabase → Sheets backup)
app.ts        helmet, cors, express.json, pino-http logging, error handling
server.ts     app boot, scheduler start, graceful shutdown
bootstrap.ts  IPv4-first DNS resolution fix (Google OAuth connectivity)
```

**Database:** Supabase (Postgres), `@supabase/supabase-js` **service_role
key** se access hota hai (RLS bypass — real authorization app-level
JWT/role checks se hoti hai, RLS sirf anon key block karne ke liye
zero-policy enabled hai). Har column deliberately `text` type hai — ye
Google-Sheets-as-DB era ka legacy hai, lossless migration ke liye rakha
gaya. Koi ORM nahi hai (Prisma/Drizzle nahi) — direct Supabase client calls.

**Google Sheets** ab sirf 2 jagah use hota hai: (1) Forms feature (live
read), (2) periodic backup destination.

---

## 7. Complete API Route Map (sab `/api` prefix ke under)

| Domain | Base path | Highlights |
|---|---|---|
| Health | `/api/health` | No auth — DB/Sheets config status |
| Auth | `/api/auth` | `POST /login` (rate-limited), `POST /register`, `GET /me` |
| Users | `/api/users` | CRUD doers, `POST /:id/reset-password` — `canManageDoers` gated |
| Tasks | `/api/tasks` | CRUD, `/reassign-all-work`, `/:id/revision(s)`, bulk delete-completed |
| Checklist | `/api/checklist` | templates + instances CRUD, `/today`, `/generate` |
| Dashboard | `/api/dashboard` | `/` (full), `/summary` |
| Activity | `/api/activity` | `/`, `/today` |
| Lists | `/api/lists` | CRUD, `/:id/members` |
| Workflow | `/api/workflow` | templates, `/overview`, `/my-steps`, instances, step complete/reject |
| Master Sheet | `/api/master-sheet` | CRUD — `canManageMasterSheet` |
| Forms | `/api/forms` | responses, statuses, member management — `canManageForms` |
| Backup | `/api/backup` | `POST /run` — shared-secret `x-backup-token` |
| Tickets | `/api/tickets` | CRUD, `/stats`, status/solution updates |
| Attendance | `/api/attendance` | mark, check-in/out, history/range, MD-only wipe/recompute |
| IMS | `/api/ims` | items, transactions, stock-ledger, reorder-sheet — all `canAccessInventory` |
| Performance | `/api/performance` | `GET /dgmax` — `canViewTeamPerformance` |

---

## 8. Frontend key files (`src/lib/`)

| File | Purpose |
|---|---|
| `api.ts` | HTTP client — base URL `NEXT_PUBLIC_API_BASE_URL`, JWT bearer auth, error unwrapping |
| `auth-context.tsx` | `AuthProvider`/`useAuth()` — login/logout/session hydration |
| `access.ts` | Frontend permission logic — **manual mirror** of backend `utils/access.ts` |
| `types.ts` | Poora domain model (Task, Doer, Workflow, Ticket, IMS, DGMAX types, etc.) |
| `checklistSchedule.ts` | Recurring checklist next-due-date calculation |
| `listBuckets.ts` | List-access UI grouping helpers |
| `scoring.ts`, `week.ts`, `format.ts` | Scoring/date/formatting helpers |

Reusable UI primitives live in `src/components/ui.tsx` (Button, Card, Modal,
PageHeader, TableWrap, EmptyState, etc.) — koi external UI library
(MUI/shadcn) use nahi hui, sab hand-rolled hai. Charting library bhi koi
nahi hai — visualizations plain stat-tiles/tables se hote hain.

---

## 9. Environment Variables

**Backend:**
```
NODE_ENV, PORT, CORS_ORIGIN, JWT_SECRET, JWT_EXPIRES_IN, BACKUP_TOKEN
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
GOOGLE_SERVICE_ACCOUNT_JSON  (or EMAIL+PRIVATE_KEY, or PATH)
GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SPREADSHEET_ID
SHEET_<ENTITY>_NAME  (optional tab-name overrides)
SCHEDULER_ENABLED, SCHEDULER_DAILY_CRON, SCHEDULER_BACKUP_CRON, SCHEDULER_TIMEZONE
LOG_LEVEL
```

**Frontend:**
```
NEXT_PUBLIC_API_BASE_URL   (default http://localhost:4000/api)
```

**GitHub Actions:** `BACKEND_URL`, `BACKUP_TOKEN` (backup.yml ke liye).

⚠️ Koi `.env.example` file repo me nahi hai — sab kuch inline code comments
(`backend/src/config/env.ts`) aur `backend/README.md` me hi documented hai.

---

## 10. Deployment

- **Backend** → Render.com, config `render.yaml` me: `rootDir: backend`,
  build `npm install --include=dev && npm run build`, start `npm start`,
  health check `/api/health`. Secrets (`JWT_SECRET`, `CORS_ORIGIN`,
  Google/Supabase creds) Render dashboard me manually set karne padte hain.
- **Frontend** → is repo me koi deployment config nahi hai (no
  `vercel.json`) — separately (likely Vercel) deploy hota hai,
  `NEXT_PUBLIC_API_BASE_URL` backend ke Render URL par point karna hoga.
- **Backup automation** → `.github/workflows/backup.yml` — GitHub Actions
  cron (har 6h) jo free-tier Render instance ko wake karke backup trigger
  karta hai (kyunki free-tier sleep hone se in-process `node-cron` kaam
  nahi karta).

---

## 11. Notable / worth-knowing details

- `next-cloudinary` dependency declared hai `package.json` me but **kahin
  use nahi ho raha** — dead dependency ho sakta hai ya future image-upload
  feature ke liye reserved hai.
- `@reticlehq/core` sirf development-mode debugging bridge hai
  (`ReticleInit.tsx`) — production build me tree-shake ho jaata hai.
- Backend TypeScript version (`^6.0.3`) frontend se (`^5`) newer hai — dono
  independent toolchains hain.
- README.md abhi bhi generic `create-next-app` boilerplate hai — actual
  project description sirf ismein (`DASHBOARD_DOCUMENTATION.md`) aur
  `docs/` folder me hai.
- `backend/README.md` khud ko "Google Sheets as database" bolta hai jo
  **outdated** hai — actual primary DB ab Supabase hai; Sheets sirf Forms +
  backup ke liye reh gaya hai.

---

## 12. Deeper reference docs (already in repo)

- `docs/FORMS.md` — Google Forms feature ka full API table + migrations.
- `docs/SCORING_WORKFLOW.md` — DGMAX scoring formulas + auth flow detail.
- `docs/workflow-prd.md` — Workflow Monitoring System ka full PRD (data
  model, TAT engine, roles, API table, limitations).
