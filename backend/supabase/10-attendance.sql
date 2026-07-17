-- ---------------------------------------------------------------------------
-- Feature: Attendance Manager Based Attendance System — a designated doer
-- (or Admin) marks attendance for every employee from a dashboard; employees
-- themselves are read-only. Run this ONCE in Supabase -> SQL Editor, BEFORE
-- deploying the new code.
-- ---------------------------------------------------------------------------

alter table public.users add column if not exists is_attendance_manager text not null default 'false';

create table if not exists public.attendance (
  id text primary key,
  employee_id text not null,
  date text not null,
  check_in text not null default '',
  check_out text not null default '',
  status text not null default '',
  late_minutes text not null default '0',
  working_minutes text not null default '0',
  early_exit_minutes text not null default '0',
  remarks text not null default '',
  marked_by text not null default '',
  created_at text not null default '',
  updated_at text not null default ''
);

-- One attendance row per employee per day.
create unique index if not exists attendance_employee_date_idx
  on public.attendance (employee_id, date);
