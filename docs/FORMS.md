# Form Responses (Google Forms)

Show responses from many Google Forms (10–50+) inside the dashboard. Each
form's answers are read **live from its linked Google Sheet** — nothing is
copied into our database, so a new submission simply shows up on the next
refresh. Every form can have completely different fields; columns are detected
automatically from the sheet's header row.

## How it works

```
Google Form  ──submit──▶  Google Sheet (Form Responses tab)
                                   │
                                   │  service account (read)
                                   ▼
        Backend  GET /forms/:id/responses  ──▶  Dashboard  /forms page
```

- **Storage:** only a small pointer per form is stored in Supabase
  (`form_configs`: name, spreadsheet id, sheet/tab name, form link, member
  IDs). Responses stay in Google Sheets and are fetched on demand via the
  existing `GoogleSheetsService`.
- **Near real-time:** the Form page polls every 20 seconds (and has a manual
  Refresh button), so new submissions appear without a page reload.

## One-time setup

Run these migrations once, in order, in Supabase → SQL Editor:
1. `backend/supabase/05-form-configs.sql` — creates the `form_configs` table.
2. `backend/supabase/06-form-response-statuses.sql` — Working/Complete status per response.
3. `backend/supabase/07-form-configs-link.sql` — adds the shareable Form Link column.
4. `backend/supabase/08-form-configs-members.sql` — adds the access-control member list.

Then **share each form's Sheet** with the app's Google **service account**
(Editor access) — the same account already used for the Master Sheet.
Without this the sheet can't be read.

## Registering a form

On the **Google Forms** page (sidebar), Admin can click **+ Add Form** and provide:

| Field                    | Where to find it                                                  |
| ------------------------ | ------------------------------------------------------------------- |
| Form Name                | Any label you like, e.g. "Site Visit Feedback"                    |
| Google Form Link (opt.)  | The shareable form URL — separate from the response Sheet         |
| Spreadsheet ID            | From the Sheet URL: `.../spreadsheets/d/`**`<THIS PART>`**`/edit` |
| Sheet / Tab Name (opt.)  | The response tab's name; blank = the spreadsheet's first tab      |

Admin can **Delete** a registered form (the Google Sheet itself is never
touched).

## Access control

In the **Form Access** section (Admin only) on the Forms page, pick which
doers can see each form's responses via a checkbox list per form. Admin
always sees every form regardless of this list; a plain doer only sees forms
they've been explicitly granted access to.

## Using the page

- **Checkbox list** — tick any forms to show; each opens its own live table, so
  several forms can be reviewed at once.
- **Search** — filters across every column of the shown forms.
- **Status** — filter/track each response's Working / Complete / Not-set state
  (Admin can set it inline; it's dashboard-only, never written to the Sheet).
- **Copy Form Link** — copies the form's shareable URL to the clipboard.
- **Pagination** — 25 rows per page per form.
- **Export CSV** — downloads the currently-filtered rows of a form, including status.

## API

All routes require auth. Registering, removing, managing access, and setting
a response's status are Admin-only; reading is scoped per-user (Admin sees
every form, a doer only sees forms they have access to).

| Method | Route                     | Role   | Purpose                                    |
| ------ | ------------------------- | ------ | ------------------------------------------- |
| GET    | `/forms`                  | scoped | List forms the caller can see              |
| GET    | `/forms/:id/responses`    | scoped | Live responses from the form's Sheet       |
| GET    | `/forms/:id/statuses`     | scoped | Working/Complete status per response row   |
| PATCH  | `/forms/:id/statuses/:row`| Admin  | Set a response's status                    |
| POST   | `/forms`                  | Admin  | Register a form                            |
| PATCH  | `/forms/:id/members`      | Admin  | Replace the access-control member list     |
| DELETE | `/forms/:id`              | Admin  | Remove a form                              |
