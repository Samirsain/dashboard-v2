-- ============================================================
-- Migration 11: Rename "Admin" role to "MD" in the users table
--               and introduce the "PC" role
-- ============================================================
-- The Postgres table is "users" (lowercase).
-- "DOERLIST" is only the Google Sheets backup tab name — not a SQL table.
-- The role column is lowercase "role".
-- Safe to re-run: UPDATE only touches rows still set to 'Admin'.
-- ============================================================

-- 1. Rename every existing Admin user to MD
UPDATE users
SET role = 'MD'
WHERE role = 'Admin';

-- 2. (Optional) If you have a CHECK constraint on the role column
--    you may need to drop and re-add it to include 'MD' and 'PC'.
--    Uncomment the lines below if your schema has such a constraint:

-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- ALTER TABLE users
--   ADD CONSTRAINT users_role_check
--   CHECK (role IN ('MD', 'PC', 'Doer'));

-- 3. Verify
SELECT role, COUNT(*) AS count
FROM users
GROUP BY role
ORDER BY role;

