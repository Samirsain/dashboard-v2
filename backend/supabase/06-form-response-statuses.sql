-- ---------------------------------------------------------------------------
-- Feature: Form Responses "Action" column — a dashboard-only Working/Complete
-- status per response row, so staff can filter which enquiries are in
-- progress. Never written back to the Google Sheet itself.
-- Run this ONCE in Supabase -> SQL Editor, BEFORE deploying the new code.
-- ---------------------------------------------------------------------------

create table if not exists public.form_response_statuses (
  id          text primary key,  -- "{Form ID}::{row number in the sheet}"
  form_id     text,
  row_number  text,
  status      text,   -- "" | "Working" | "Complete"
  updated_at  text
);
alter table public.form_response_statuses enable row level security;
