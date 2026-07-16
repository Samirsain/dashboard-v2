# Form Responses

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
  (`form_configs`: name, spreadsheet id, sheet/tab name). Responses stay in
  Google Sheets and are fetched on demand via the existing
  `GoogleSheetsService`.
- **Near real-time:** the Form page polls every 20 seconds (and has a manual
  Refresh button), so new submissions appear without a page reload.

## One-time setup

1. **Run the migration** — in Supabase → SQL Editor, run
   `backend/supabase/05-form-configs.sql` once (creates the `form_configs`
   table).
2. **Share each form's Sheet** with the app's Google **service account**
   (Editor access) — the same account already used for the Master Sheet.
   Without this the sheet can't be read.

## Registering a form

On the **Form** page (sidebar), Admin / Manager / PC can click **+ Add Form**
and provide:

| Field           | Where to find it                                             |
| --------------- | ----------------------------------------------------------- |
| Form Name       | Any label you like, e.g. "Site Visit Feedback"              |
| Spreadsheet ID  | From the Sheet URL: `.../spreadsheets/d/`**`<THIS PART>`**`/edit` |
| Sheet / Tab Name| The response tab's name, usually `Form Responses 1`         |

Admin / Manager can **Delete** a registered form (the Google Sheet itself is
never touched).

## Using the page

- **Checkbox list** — tick any forms to show; each opens its own live table, so
  several forms can be reviewed at once.
- **Search** — filters across every column of the shown forms.
- **Column filter** — per table, pick a column and filter by a value it
  contains.
- **Pagination** — 25 rows per page per form.
- **Export CSV** — downloads the currently-filtered rows of a form.
- **Chart** — a "count by column" bar chart (e.g. how many chose each option),
  built in the app's own style (no extra chart library).

## API

All routes require auth. Registering/removing is role-restricted.

| Method | Route                     | Role               | Purpose                              |
| ------ | ------------------------- | ------------------ | ------------------------------------ |
| GET    | `/forms`                  | any signed-in      | List registered forms                |
| GET    | `/forms/:id/responses`    | any signed-in      | Live responses from the form's Sheet |
| POST   | `/forms`                  | Admin/Manager/PC   | Register a form                      |
| DELETE | `/forms/:id`              | Admin/Manager      | Remove a form                        |
