-- ---------------------------------------------------------------------------
-- Feature: Form Responses — registered Google Forms shown under the "Form"
-- sidebar item. Only the pointer to each form's response Sheet is stored
-- here; responses themselves are read live from that Sheet, never copied in.
-- Run this ONCE in Supabase -> SQL Editor, BEFORE deploying the new code.
-- ---------------------------------------------------------------------------

create table if not exists public.form_configs (
  id             text primary key,
  name           text,   -- e.g. "Site Visit Feedback"
  spreadsheet_id text,   -- the linked Google Sheet's ID (from its URL)
  sheet_name     text,   -- the response tab's name, e.g. "Form Responses 1"
  created_at     text
);
alter table public.form_configs enable row level security;
