-- ---------------------------------------------------------------------------
-- ThirtyMilestones Task MIS — Supabase (Postgres) schema
--
-- Run this ONCE in the Supabase dashboard:
--   Project -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- Every column is `text` on purpose: the application always used a string-only
-- model (it came from Google Sheets), so keeping columns as text is lossless
-- and avoids any type-coercion surprises during migration. IDs are the
-- application-generated UUID/prefixed strings, used directly as primary keys.
--
-- These tables are written to only by the backend using the service_role key,
-- which bypasses Row Level Security. We still enable RLS with no public policy
-- so the anon/publishable key cannot read or write anything directly.
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id            text primary key,
  employee_code text,
  name          text,
  mobile        text,
  email         text,
  department    text,
  role          text,
  status        text,
  password_hash text,
  created_at    text
);
create index if not exists users_email_idx on public.users (lower(email));
create index if not exists users_employee_code_idx on public.users (lower(employee_code));

create table if not exists public.tasks (
  id              text primary key,
  title           text,
  description     text,
  assigned_doer_id text,
  doer_name       text,
  priority        text,
  due_date        text,
  status          text,
  revision_date   text,
  revision_count  text,
  department      text,
  created_by      text,
  created_at      text,
  updated_at      text,
  repeat_type     text,
  repeat_value    text
);
create index if not exists tasks_assigned_doer_idx on public.tasks (assigned_doer_id);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_due_date_idx on public.tasks (due_date);

create table if not exists public.revisions (
  id            text primary key,
  task_id       text,
  old_due_date  text,
  new_due_date  text,
  reason        text,
  comment       text,
  revised_by    text,
  revised_at    text
);
create index if not exists revisions_task_idx on public.revisions (task_id);

create table if not exists public.checklist_templates (
  id              text primary key,
  task_name       text,
  description     text,
  frequency       text,
  frequency_value text,
  assigned_doer_id text,
  department      text,
  priority        text,
  status          text,
  created_at      text
);

create table if not exists public.checklist_instances (
  id              text primary key,
  template_id     text,
  task_name       text,
  date            text,
  assigned_doer_id text,
  status          text,
  completed_by    text,
  completed_at    text
);
create index if not exists checklist_instances_date_idx on public.checklist_instances (date);
create index if not exists checklist_instances_template_idx on public.checklist_instances (template_id);

create table if not exists public.activity_logs (
  id      text primary key,
  actor   text,
  action  text,
  task    text,
  date    text,
  time    text,
  details text
);
create index if not exists activity_logs_date_idx on public.activity_logs (date);
create index if not exists activity_logs_task_idx on public.activity_logs (task);

create table if not exists public.tickets (
  id              text primary key,
  employee_id     text,
  employee_name   text,
  department      text,
  title           text,
  description     text,
  solution_option1 text,
  solution_option2 text,
  blanket_required text,
  priority        text,
  attachment_url  text,
  status          text,
  solution        text,
  solution_type   text,
  created_at      text,
  updated_at      text
);
create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_employee_idx on public.tickets (employee_id);

-- Lock the tables down: enable RLS with no policies, so only the backend's
-- service_role key (which bypasses RLS) can touch the data.
alter table public.users               enable row level security;
alter table public.tasks               enable row level security;
alter table public.revisions           enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_instances enable row level security;
alter table public.activity_logs       enable row level security;
