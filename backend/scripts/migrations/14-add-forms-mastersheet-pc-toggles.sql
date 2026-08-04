-- ============================================================
-- Migration 14: PC Management toggles for Google Forms & Master Sheet
-- ============================================================
-- Extends PC Management (migrations 12-13) with two more capabilities every
-- PC already had unconditionally: managing Google Forms (register/remove a
-- form, manage its access, set response status) and editing the Master
-- Sheet. Default TRUE, same reasoning as migration 13 — nothing changes for
-- existing PCs until the MD unchecks one.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_forms boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_master_sheet boolean NOT NULL DEFAULT true;

-- Verify
SELECT can_manage_forms, can_manage_master_sheet, COUNT(*)
FROM users
GROUP BY 1, 2;
