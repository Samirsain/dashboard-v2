-- ---------------------------------------------------------------------------
-- Feature: Master Sheet — a documentation grid for each list/system.
-- Run this ONCE in Supabase -> SQL Editor, BEFORE deploying the new code.
-- ---------------------------------------------------------------------------

create table if not exists public.master_sheets (
  id          text primary key,
  code        text,   -- TL, CL, TL2, CL2 ...
  name        text,
  type        text,   -- e.g. "Task List" / "Checklist"
  description text,
  date        text,   -- when this list/system was created (free text)
  videos      text,   -- training video links (one per line)
  pc          text,   -- Process Coordinator
  ps          text,   -- Problem Solver
  access      text,   -- doers who have access
  link        text,   -- reference link
  created_at  text
);
alter table public.master_sheets enable row level security;
