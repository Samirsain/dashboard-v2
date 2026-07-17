-- ---------------------------------------------------------------------------
-- Feature: Form Responses access control — which doers can see a given
-- form's responses. Admin/Manager/PC always see everything regardless of
-- this list. Run this ONCE in Supabase -> SQL Editor, BEFORE deploying.
-- ---------------------------------------------------------------------------

alter table public.form_configs add column if not exists member_ids text;
