-- ============================================================
-- Migration 17: Sending a workflow step back requires a reason
-- ============================================================
-- Rejecting a step reopens the previous one for rework, but until now it did
-- so silently — the person picking it back up had no idea what was wrong
-- with what they'd already done. The reason is stored on the REOPENED
-- (previous) step's event, since that's whose screen it needs to show up on.
-- Safe to re-run.
-- ============================================================

alter table public.workflow_step_events
  add column if not exists reject_reason text default '';

-- Verify
select count(*) as event_count from public.workflow_step_events;
