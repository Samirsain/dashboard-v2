-- ---------------------------------------------------------------------------
-- Feature: Remove the "Manager" and "PC" roles from the app — only "Admin"
-- and "Doer" remain. Any existing account still carrying the old role value
-- is converted to "Doer" so it keeps logging in and working normally
-- (Admin retains every permission that Manager/PC used to have too).
-- Run this ONCE in Supabase -> SQL Editor, BEFORE deploying the new code.
-- ---------------------------------------------------------------------------

update public.users
set role = 'Doer'
where role in ('Manager', 'PC');
