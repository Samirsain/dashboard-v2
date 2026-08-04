-- ============================================================
-- Migration 13: More per-PC permission toggles
-- ============================================================
-- Extends the PC Management column (migration 12) beyond the four
-- MD-exclusive capabilities to cover the capabilities every PC already had
-- unconditionally: creating/reassigning tasks (& the All Tasks page),
-- Inventory, and managing Workflow templates. These default TRUE (unlike
-- migration 12's toggles, which default false) so no existing PC loses
-- access it already has — the MD can now selectively turn any of them OFF
-- per PC, in addition to turning the original four ON.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_all_tasks boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_inventory boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_workflow boolean NOT NULL DEFAULT true;

-- Verify
SELECT can_access_all_tasks, can_access_inventory, can_manage_workflow, COUNT(*)
FROM users
GROUP BY 1, 2, 3;
