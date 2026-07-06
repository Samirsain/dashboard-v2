-- ---------------------------------------------------------------------------
-- Feature: admin-created Lists (Task Lists / Checklists)
-- Run this ONCE in Supabase -> SQL Editor, BEFORE deploying the new code.
-- ---------------------------------------------------------------------------

-- Named categories an admin creates from the dashboard.
create table if not exists public.lists (
  id         text primary key,
  name       text,
  type       text,   -- 'task' or 'checklist'
  member_ids text,   -- comma-separated Doer IDs who can access this list
  created_at text
);
alter table public.lists enable row level security;

-- If the lists table already existed without member_ids, add it:
alter table public.lists add column if not exists member_ids text default '';

-- Tasks and checklist templates can be filed under a list.
alter table public.tasks
  add column if not exists list_id text default '';
alter table public.checklist_templates
  add column if not exists list_id text default '';
