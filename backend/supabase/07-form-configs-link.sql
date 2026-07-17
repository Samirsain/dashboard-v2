-- ---------------------------------------------------------------------------
-- Feature: Form Responses — store each form's shareable Google Form link
-- (separate from its response Spreadsheet ID), so it can be copied from the
-- dashboard. Run this ONCE in Supabase -> SQL Editor, BEFORE deploying.
-- ---------------------------------------------------------------------------

alter table public.form_configs add column if not exists form_link text;
