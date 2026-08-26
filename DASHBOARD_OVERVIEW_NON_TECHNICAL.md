# ThirtyMilestones Dashboard — Complete Guide (For Everyone)

> This document explains the dashboard in plain, everyday English — no
> coding knowledge needed. If you read this file from top to bottom, you
> will understand exactly what this system does, who uses it, and every
> feature it offers.

---

## 1. What is this dashboard, in one sentence?

It is an **internal company management system** — a single website where
employees log in to manage their daily work: tasks, checklists,
attendance, performance tracking, a step-by-step approval process
(workflow), inventory, help requests, and Google Form responses — all in
one place, instead of using scattered spreadsheets, WhatsApp messages, and
paper registers.

Think of it as a private, company-only version of tools like Asana, Trello,
or a company ERP — but custom-built specifically for this organization's
way of working.

---

## 2. Who uses it, and what can each person do?

The system has **three levels of users**:

1. **MD (Managing Director / top boss)**
   Has complete, unrestricted access to everything — can see all
   employees' work, delete anything, change anyone's password, approve or
   reject workflow steps, manage inventory, view performance scores of the
   whole team, and configure who else gets what access.

2. **PC ("deputy" / manager-level staff)**
   A trusted senior employee who can be given **specific permissions** by
   the MD — for example, one PC might be allowed to manage attendance but
   not delete tasks; another might be allowed to manage the workflow
   system but not view team performance scores. Each permission is a
   separate on/off switch that the MD controls from the Settings page.
   There is also a special "Assistant" version of this role — someone with
   almost all admin powers, except they are **never allowed to delete**
   an employee or a task, even by mistake.

3. **Doer (regular employee)**
   Can only see and manage their **own** work — their own tasks, their own
   checklist, their own attendance, and the workflow steps specifically
   assigned to them. They cannot see other employees' private task lists
   or performance scores unless specifically given access.

Logging in requires either the person's **email address** or their
**employee code** (like `TM01`), plus their password. A person only sees
the menu items and pages relevant to their permission level — for example,
a regular employee will not even see an "All Tasks" or "Inventory" link in
their sidebar if they are not allowed to use it.

---

## 3. The main sections of the dashboard (what each page does)

### 3.1 Home / Dashboard
The first screen after logging in. It shows a quick summary of everything
important at a glance:
- How many tasks are pending, urgent, overdue, or critical
- A running feed of recent activity across the company (who did what, and
  when)
- A button to quickly create a new task, or kick off a new "workflow" (see
  section 3.5)

### 3.2 My Tasks
Every employee's personal to-do list. They can see what has been assigned
to them, mark progress, and — if a deadline needs to change — request a
"revision" (a documented reason for pushing the due date, so there's always
a record of *why* something got delayed, rather than the date silently
changing).

### 3.3 All Tasks (managers only)
A company-wide view of every task assigned to every employee. Managers use
this to see the full picture, reassign tasks between people, and spot
tasks that got "orphaned" — meaning the person they were assigned to has
since left the company or been removed from the system, so the task now
needs a new owner.

### 3.4 Checklist
Some jobs repeat every day, every week, or every month (like "open the shop
at 9 AM" or "submit weekly report"). Instead of someone having to
re-create these tasks manually every time, the system automatically
generates a fresh checklist item on schedule, and employees simply tick it
off when done.

### 3.5 Workflow (the most advanced feature)
This is a **multi-step approval and process-tracking system** — useful for
any process that has to pass through several people in sequence before
it's considered "done." For example: a purchase request might need to go
from "Request Created" → "Approved by Manager" → "Verified by Finance" →
"Payment Released," with a different person responsible for each step.

How it works, in plain terms:
- Someone (usually a manager) first creates a **Template** — a blueprint
  listing all the steps in the process, who is responsible for each step,
  how it should be done, and how much time (the "TAT" — Turnaround Time)
  each step is allowed to take.
- When an actual case needs to go through this process, someone **starts
  an instance** (a live "run") of that template. Importantly, this makes
  its own independent copy of the steps — so if the master template is
  edited later, it does **not** change any process that is already
  underway or already finished. This protects historical records from
  being silently altered.
- Each step automatically gets a calculated deadline, based on realistic
  working hours (9:30 AM to 6:30 PM, with Sundays off) — so a 2-hour task
  assigned Saturday evening doesn't unfairly show as "overdue" first thing
  Sunday morning.
- If a step is not completed by its deadline, the system automatically
  shows it as **"Overdue"** the moment anyone looks at it — this is
  calculated live, not stored, so it's always accurate to the current
  moment.
- If someone reviewing a step finds a problem, they can **send it back**
  ("rework") to the previous person with a reason. If the same step keeps
  bouncing back and forth too many times (3 times), the system flags it as
  an escalation so a manager can step in.
- Managers get an "overview" screen that summarizes the status of every
  ongoing process by workflow, by step, and by person — so even if there
  are hundreds of processes running at once, the summary stays short and
  easy to scan rather than becoming an overwhelming, endless list.
- Regular employees only see the steps assigned to them ("My Workflow"),
  not the whole company's processes.

*Current known limits (by design, not bugs):* it doesn't yet support steps
happening in parallel (everything is one after another), it doesn't
account for company holidays (only Sundays), there are no push
notifications (the screen refreshes itself automatically instead), and you
can't attach files to a step.

### 3.6 Master Sheet
A simple, admin-editable reference table used to document the company's
various internal systems and lists — essentially a shared knowledge/notes
table.

### 3.7 Forms (Google Forms integration)
Many companies use Google Forms for things like daily reports, surveys, or
data collection. Instead of everyone having to open Google Sheets
separately to check responses, this dashboard pulls in the **live**
responses from all the linked Google Forms directly into one screen,
refreshing automatically every 20 seconds. Each employee only sees the
forms relevant to them (controlled by an access list), while managers can
see all of them. Managers can also mark each response as "Working" or
"Complete" to track follow-up, search through responses, and export
everything to a CSV (spreadsheet) file.

### 3.8 Attendance
Employees check in and check out for the day. The system automatically
works out how many minutes they worked, whether they were late, and
whether they left early. There are views to see today's attendance,
history over time, or a custom date range. Managers with the right
permission can correct mistakes (edit a record), and the MD alone has the
power to wipe or recompute all attendance data if something goes seriously
wrong.

### 3.9 Team Performance (DGMAX Score)
A weekly scoring system that automatically rates how reliably each
employee completed their assigned tasks, based on a simple idea:
- Every task assigned to someone in a week is worth an equal share of 100
  points.
- If a task was finished **on time**, no points are lost.
- If a task was finished **late**, a partial penalty is applied (by
  default, late tasks lose 60% of their share, though this percentage can
  be adjusted by the admin).
- If a task was **not done at all**, the full share is lost.
- Tasks that are still pending (not yet due) or were officially cancelled
  are excluded from the calculation, so no one is penalized unfairly for
  work that hasn't come due yet or was called off.

The result is a performance score out of 100 for each employee, each week,
visible to managers on the Team Performance page.

### 3.10 Settings (employee & access management)
This is where managers set up and maintain the whole system:
- Add new employees ("Doers") to the system
- Reset anyone's password
- Organize employees into "Lists" (like departments or teams) and control
  who can see which list
- Turn specific permissions on or off for each PC/deputy manager
- Bulk-transfer all of one employee's work to another employee (useful
  when someone goes on leave or leaves the company)

### 3.11 Help Ticket System
An internal IT/HR-style support desk. Any employee can raise a ticket
describing a problem, choose how urgent it is, and it gets routed to the
right manager. The manager can respond with a solution and update the
ticket's status as it moves through its lifecycle: **Pending → Waiting for
Employee's Response → Reopened (if unresolved) → Completed.**

### 3.12 Inventory Management System (IMS)
For tracking physical stock/inventory:
- A catalogue of all items, identified by SKU codes
- A log of every stock movement — items coming in and items going out
- An automatically calculated **Stock Ledger**, showing exactly how much
  stock existed on any given date
- A **Reorder Sheet** — a report that tells the team which items are
  running low and need to be reordered, based on factors like minimum
  order quantity, supplier lead time, and a safety buffer

---

## 4. Behind the scenes — how the system is built (in simple terms)

You don't need to understand this to *use* the dashboard, but here's what's
happening underneath, explained without jargon:

- **Two separate programs work together:** one is the website you see and
  click around in (the "frontend"), and the other is a background server
  (the "backend") that stores and manages all the actual data. They talk
  to each other over the internet, the same way your web browser talks to
  any website.
- **Where the data lives:** almost everything (tasks, employees,
  attendance, workflows, tickets, inventory) is stored in a secure online
  database called Supabase. Google Sheets is only used for two much
  smaller purposes now: reading live Google Form responses, and keeping a
  periodic backup copy of the data — it is **not** the main storage system
  anymore, even though it used to be in an earlier version of this project.
- **Security:** passwords are never stored in plain, readable text — they
  are scrambled (hashed) in a way that can't be reversed, even by the
  people running the system. Every action a user takes requires a valid,
  time-limited login token, and the system re-checks that person's current
  permissions on every single action — so if a manager changes someone's
  access rights, it takes effect immediately, without that person needing
  to log out and back in.
- **Automatic housekeeping:** a background scheduler runs every night to
  generate the next day's recurring checklist items and flag overdue work,
  and it also runs every few hours to back up all the data to Google
  Sheets automatically, without anyone needing to do it manually.
- **Where it's hosted:** the backend server runs on a cloud hosting service
  called Render, and the website itself is hosted separately (most likely
  on a service called Vercel, which is common for this kind of website).

---

## 5. Quick feature checklist (at a glance)

- [x] Secure login with role-based access (Boss / Manager / Employee)
- [x] Personal & company-wide task tracking, with due-date change history
- [x] Auto-generated recurring daily/weekly/monthly checklists
- [x] Multi-step workflow / approval process tracker with automatic
      deadlines and escalation
- [x] Weekly employee performance scoring
- [x] Live Google Forms response viewer with CSV export
- [x] Attendance check-in/out with automatic late/working-time calculation
- [x] Internal help-desk / IT-HR ticketing system
- [x] Inventory tracking with automatic reorder alerts
- [x] Employee & permissions management console
- [x] Automatic nightly checklist generation and scheduled data backups

---

## 6. Summary

In short: this dashboard replaces a scattered mix of spreadsheets, paper
registers, and messaging apps with **one organized system** where every
employee's work, attendance, performance, approvals, inventory, and
support requests are tracked, automated, and made visible to the right
people — while keeping strict, permission-based control over who can see
or change what.
