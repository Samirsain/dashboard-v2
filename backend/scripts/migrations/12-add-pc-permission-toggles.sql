-- ============================================================
-- Migration 12: Per-PC permission toggles
-- ============================================================
-- Previously the four MD-exclusive capabilities (delete a task, Doer
-- Management, Team Performance, edit attendance) were an all-or-nothing
-- block on every PC. This lets the MD grant them individually, per PC,
-- from the new "PC Management" column in Settings.
--
-- Default false for everyone (including existing PCs) so nobody gains
-- access silently — the MD has to opt each one in explicitly.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_delete_task boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_doers boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_team_performance boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_attendance boolean NOT NULL DEFAULT false;

-- Verify
SELECT can_delete_task, can_manage_doers, can_view_team_performance, can_edit_attendance, COUNT(*)
FROM users
GROUP BY 1, 2, 3, 4;
