# Workflow (WFMS) — Product Requirements Document

**Status:** Live in production
**Last updated:** 2026-08-17
**Scope:** This document describes the Workflow feature **as it is built today**. Anything not listed here is not implemented.

---

## 1. Why this exists

Multi-step work used to be tracked in a Google Sheet. One row per job, columns
across the top for each step, and a person manually filling in when each step was
planned and when it actually happened.

That sheet had four problems:

1. **Nobody knew whose turn it was.** The sheet showed dates, not ownership.
2. **Deadlines were guesses.** "Planned" was typed by hand, so it drifted.
3. **Late work was invisible** until someone read every row.
4. **It didn't scale.** One workflow with hundreds of rows was unreadable, and
   adding a second workflow meant a second sheet with its own conventions.

The Workflow feature replaces that sheet. It keeps the sheet's shape — steps
across the top, one row per job — but the system now owns ownership, deadlines,
and lateness instead of a person typing them in.

---

## 2. Core concepts

| Concept | What it is | Example |
|---|---|---|
| **Template** | A reusable chain of steps. Defines *what* happens, *who* does it, *how*, and *how long* each step gets. Also defines what data each job carries. | "Purchase Order" |
| **Data Field** | One piece of information every job of this template records. The **first field names the job**. | "PO Number", "Vendor Name" |
| **Step** | One link in the chain: What / Who / How / TAT. | "Generate PO — Samir — Tally — 2h" |
| **Run** | One actual execution of a template. Called "work" in the UI. | PO-1042 |
| **Step Event** | A step as it exists inside one specific run, with its own Planned / Actual / Status. | "Generate PO on PO-1042" |

**Key design decision:** when a run starts, its steps are **copied** from the
template into step events. Editing or deleting a template later does not change
runs already in flight or already finished. A completed run is a permanent
record and must stay readable on its own.

The same applies to field values: each stores its own `label` alongside its
`value`, so a finished run is readable even if the template is later renamed.

---

## 3. Roles and permissions

| Role | Can do |
|---|---|
| **MD** | Everything. Always. |
| **PC** | Same as MD, **only if** granted the `canManageWorkflow` permission in PC Management. Off by default per-PC. |
| **Doer** | Sees only their own steps. Can mark their own step done, or send it back. Cannot see templates, other people's work, or the Live Board. |

**Manage** means: create/delete templates, start runs, delete runs, export, and
view the Live Board.

Server-side enforcement (not just hidden UI):
- A doer can only act on a step where `doerId` matches them. Anyone with manage
  rights can act on any step — for when someone is away.
- `GET /workflow/overview` is manage-only. It deliberately shows every person's
  outstanding work, which is exactly what a doer's view must not.

---

## 4. TAT and the deadline cascade

### 4.1 Working calendar

Fixed, not configurable:
- **09:30 – 18:30**, timezone from server config (IST)
- **Sunday off**
- No holiday calendar

### 4.2 TAT formats

| Format | Meaning |
|---|---|
| `30m` | 30 business-minutes |
| `2h` or `2` | 2 business-hours |
| `SAME_DAY` | End of the current working day |
| `NEXT_DAY` | End of the next working day |
| `WHENEVER_NEEDED` | No automatic deadline |
| `WHENEVER_NEEDED:2026-08-20` | A date picked by hand when the run was started |

### 4.3 The cascade

```
Planned(step 1) = addTAT(run start time, TAT of step 1)
Planned(step n) = addTAT(Actual completion of step n-1, TAT of step n)
```

A step's clock **starts when the previous step actually finishes**, not when the
run started. So one slow step pushes everything after it, and the board reflects
reality rather than an original plan nobody is following.

Business-hours arithmetic: a 2h TAT started at 17:30 lands at 10:30 the next
working day, not 19:30 the same evening.

**Exception — manually picked dates.** A `WHENEVER_NEEDED:<date>` deadline
resolves to 18:30 on that exact date, and is deliberately *not* rolled off a
Sunday or adjusted for business hours. A person chose that date on purpose; the
system doesn't second-guess it.

### 4.4 Overdue is never stored

A step's status is only ever *persisted* as `Pending` / `Active` / `Complete` /
`Blocked`. **`Overdue` is computed at read time** by comparing `Planned` to the
current clock.

This means it can never go stale — there is no job that has to run to mark
things late, and no window where the database disagrees with the wall clock.
It's also why both the doer view and the management view poll every 60 seconds:
a step that goes late while you're looking at the screen turns red on its own.

---

## 5. Run lifecycle

```
Start run
   │  step 1 → Active (Planned stamped)
   │  steps 2..n → Pending
   ▼
Doer completes step 1
   │  step 1 → Complete (Actual stamped)
   │  step 2 → Active (Planned computed from step 1's Actual)
   ▼
   ... repeat ...
   ▼
Last step completed → run status = Complete
```

### Sending work back (rework)

A doer whose step is Active can **send it back** to the previous step:

- Current step → `Blocked`, its rework counter increments
- Previous step → reopens as `Active`, its `Actual` is cleared
- Step 1 cannot be sent back (there is nothing behind it)

**Rework cap:** after **3** send-backs, the step is no longer auto-reopened.
It stays `Blocked` and is logged as escalated — a loop that has gone around
three times is a problem for a human to resolve, not for the system to keep
cycling.

---

## 6. Screens

### 6.1 Live Board (MD / permitted PC)

The landing view. Answers "what needs attention right now, across everything?"

- **Three counters:** Running Work, Overdue Steps, Due Today
- **Person chips:** every person holding work, with their exact load and how
  much of it is late. One click filters the board to them. Chips rather than a
  dropdown so an overloaded person is visible without opening anything.
- **Pile rows:** grouped by **(workflow, step, person)** — see §7 for why.
  Sorted most-overdue first. Each row expands to the most urgent runs inside it;
  clicking one opens its Step Timeline.
- **Search** filters the board by workflow, step or person.

### 6.2 Workflows section (MD / permitted PC)

A wrapping row of tick-chips, one per workflow, each showing live "N late" /
"N running" badges so you can tell which one needs opening without opening it.
A workflow with late work carries a red border.

Ticking one opens its **sheet** below — one at a time, since each sheet is a
wide table.

**The sheet** reproduces the original tracking sheet's shape:
- Step headers across the top carrying What / Who / How / When, sitting directly
  above their own columns
- One row per run underneath: the run's identity (pinned on the left so it stays
  visible while scrolling sideways), when it started, its other field values,
  then each step's status, timing and delay
- Search, Active/Complete tabs, and paging (20 at a time)
- Per-row delete, plus Export and Delete for the workflow itself

### 6.3 Step Timeline

Opens when a run is clicked from either the Live Board or a sheet. Full
step-by-step detail: What / Who / How / Planned / Actual / Delay / Status, with
Done and Send Back buttons where applicable, and Delete This Work.

### 6.4 My Workflow (doer)

Deliberately minimal — no templates, no other people's work.

- A headline count of tasks waiting on them, with an overdue badge
- Workflow tick-chips (only shown when they have more than one; with a single
  workflow it just opens)
- One card per step: **What / Who / How / When**, the run's own field values so
  they know what the job is about, and Mark Done / Send Back
- Overdue cards turn red
- "Coming up for you" — steps not yet their turn, so they can see what's heading
  their way
- Refreshes itself every 60 seconds

### 6.5 Export

Downloads a workflow's entire history as CSV in the original sheet layout:
What / Who / How / When header blocks per step, then one row per run. New runs
simply append as new rows.

---

## 7. Designed for scale

This is the part that separates the feature from the spreadsheet it replaced.

**Problem:** one workflow can carry a thousand runs, and they pile up at the
same step under the same person. Listing every outstanding step gives a thousand
near-identical rows that all say the same thing — and a response that grows with
the backlog.

**Solution:** the Live Board groups by **(workflow, step, person)**. A thousand
backed-up runs become *one row*: "this person has 1000 runs sitting on this
step, 12 of them late."

- **Counts are always exact** — computed server-side over every outstanding step
- **Only the 10 most urgent runs per group are sent**, with the row stating
  "showing the 10 most urgent of 1000"
- **Person chip totals are computed server-side too**, so sampling can never
  make them lie

Result: the response is bounded by *how the workflows are configured*, not by
how much work is outstanding. Measured: 1000 outstanding runs → 1 row →
~1.6 KB payload.

**Database reads** are filtered in Postgres rather than fetched-then-filtered:
the Live Board and the doer view read only `Active` runs, and a doer reads only
their own step events. Since finished work becomes the bulk of the table over
time, both stay roughly flat as history accumulates.

**Known limit:** `exportTemplateData` still loads a workflow's full run history
in one go. Fine into the hundreds; beyond that it will need paging or a
date-range filter.

---

## 8. Data model

```
workflow_templates          id, name, created_at
workflow_template_fields    id, template_id, field_no, label, type
workflow_steps              id, template_id, step_no, what, doer_id, how, tat
workflow_instances          id, template_id, title, details, field_values (JSON),
                            started_at, status, requested_by
workflow_step_events        id, instance_id, step_no, what, doer_id, how, tat,
                            planned, actual, status, rework_count
```

Step events duplicate `what` / `doer_id` / `how` / `tat` from the template step
**on purpose** — that is what makes a run survive later template edits.

---

## 9. API

| Method | Path | Access |
|---|---|---|
| GET | `/workflow/templates` | Any signed-in user |
| GET | `/workflow/templates/:id` | Any signed-in user |
| POST | `/workflow/templates` | Manage |
| DELETE | `/workflow/templates/:id` | Manage |
| GET | `/workflow/templates/:id/export` | Manage |
| GET | `/workflow/overview` | Manage |
| GET | `/workflow/my-steps` | Any signed-in user (own steps only) |
| GET | `/workflow/instances` | Any signed-in user |
| GET | `/workflow/instances/:id` | Any signed-in user |
| POST | `/workflow/instances` | Manage |
| DELETE | `/workflow/instances/:id` | Manage |
| POST | `/workflow/instances/:id/steps/:stepNo/complete` | Step owner, or Manage |
| POST | `/workflow/instances/:id/steps/:stepNo/reject` | Step owner, or Manage |

---

## 10. Deliberate non-goals

Things left out on purpose, not by oversight:

- **No parallel steps.** The chain is strictly sequential. Real branching work
  hasn't been asked for, and it would complicate the deadline cascade for
  everyone.
- **No holiday calendar.** Sunday-off only.
- **No notifications.** The board and the doer's screen are pull-based, both
  self-refreshing every 60s.
- **No template editing.** Templates are created and deleted, not edited —
  editing a live template would silently change what people are working on.
  Create a new one instead.
- **No file attachments on runs.** The `details` free-text field carries extra
  context.
- **No per-run reassignment.** Who does a step is fixed by the template. If the
  person is away, anyone with manage rights can act on the step for them.

---

## 11. Open items

| Item | Why it matters |
|---|---|
| `GET /workflow/instances` and `/instances/:id` are open to any signed-in user | Inconsistent with the rest: the Live Board is manage-only precisely so a doer can't see everyone's work, but these two endpoints would still return it. The doer UI never calls them, so nothing leaks through the app — but the API allows it. |
| Export paging | Full history in one request will not hold past a few thousand runs |
| Assigning a run to someone other than the template's doer | Currently handled by a manager acting on their behalf, which loses who really did it |
| Holiday calendar | Deadlines currently fall on public holidays |
