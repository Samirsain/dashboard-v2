# Backend — Task Management API (Google Sheets DB)

Express + TypeScript API that uses a Google Spreadsheet as its database.
No mock/local storage — every read and write goes through the Google
Sheets API via `src/services/googleSheets.service.ts`.

## Setup

```bash
npm install
cp .env.example .env
```

Until you add real Google credentials, the server still starts and
responds to `/api/health`, but any endpoint that touches a sheet returns
`503 SHEETS_NOT_CONFIGURED` with a clear message instead of crashing.

### Wiring in Google Sheets

1. Create a Google Cloud service account with the Sheets API enabled and
   share your target spreadsheet with its `client_email` (Editor access).
2. Put its credentials in `.env` — pick **one** of:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the full key JSON as one line, or
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or
   - `GOOGLE_APPLICATION_CREDENTIALS` — path to the key file.
3. Set `GOOGLE_SHEETS_SPREADSHEET_ID` to your spreadsheet ID.
4. (Optional) Override individual tab names via `SHEET_<ENTITY>_NAME` if
   they differ from the defaults in `src/config/sheets.config.ts`
   (`Users`, `Tasks`, `ChecklistTemplates`, `ChecklistInstances`,
   `ActivityLogs`). Missing tabs are auto-created with the expected header
   row on first use.

No code changes are needed for any of the above — everything is read from
`.env` through `src/config/`.

## Run

```bash
npm run dev     # ts-node/tsx watch mode
npm run build   # compile to dist/
npm start       # run compiled server
npm run typecheck
```

## Structure

```
src/
  config/       env + Google Sheets spreadsheet/tab configuration
  types/        shared domain types
  utils/        logger, AppError, id generation, date/frequency helpers
  services/     googleSheets.service.ts (generic CRUD-by-ID) + domain services
  validation/   Zod schemas per resource
  middleware/   JWT auth, role guard, Zod validation, error handling
  controllers/  thin HTTP layer over services
  routes/       Express routers, mounted under /api
  scheduler/    node-cron daily job (checklist generation + overdue flagging)
```

## API

All routes are under `/api` and (aside from `/auth/login`, `/auth/register`,
`/health`) require `Authorization: Bearer <jwt>`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | |
| POST | `/api/auth/register` | |
| GET | `/api/auth/me` | |
| GET/POST | `/api/users` | POST requires Admin/Manager |
| GET/PATCH/DELETE | `/api/users/:id` | |
| GET/POST | `/api/tasks` | filters: `assignedTo`, `status`, `priority`, `department` |
| GET/PATCH/DELETE | `/api/tasks/:id` | |
| POST | `/api/tasks/:id/revision` | `{ newDueDate, reason, comment }` |
| GET/POST | `/api/checklist/templates` | |
| GET/PATCH/DELETE | `/api/checklist/templates/:id` | |
| GET | `/api/checklist/instances` | filters: `date`, `status`, `assignedTo` |
| GET | `/api/checklist/today` | |
| POST | `/api/checklist/instances/:id/complete` | |
| POST | `/api/checklist/generate` | manually re-run today's generation |
| GET | `/api/dashboard` | full dashboard payload |
| GET | `/api/dashboard/summary` | KPI cards only |
| GET | `/api/activity` / `/api/activity/today` | |

## IDs, not row numbers

Every sheet has a dedicated ID column (see `src/config/sheets.config.ts`).
All lookups/updates/deletes resolve the current row number right before
the write and never cache row positions — reordering or deleting rows in
the spreadsheet directly won't break lookups.
