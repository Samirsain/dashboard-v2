-- ============================================================
-- Migration 16: Help tickets are addressed to someone
-- ============================================================
-- A ticket used to have only a raiser; management saw every ticket and
-- anyone in management could answer it. That works while tickets only ever
-- travel one way (doer -> management), but they don't: a PC raises things
-- with the MD, and the MD raises things with a PC.
--
-- So a ticket now names its recipient. The recipient is always an MD or a
-- PC (that's who resolves things), and never the raiser themselves.
--
-- assigned_to_name is stored alongside the id on purpose, matching how the
-- raiser's name is already denormalised here: a closed ticket is a record,
-- and it should stay readable even if that person is later renamed or
-- removed.
--
-- Existing rows keep empty values. They stay visible to their raiser and to
-- the MD (who sees everything), so nothing already filed disappears.
-- Safe to re-run.
-- ============================================================

alter table public.tickets
  add column if not exists assigned_to_id   text default '';
alter table public.tickets
  add column if not exists assigned_to_name text default '';

-- Tickets are listed by "addressed to me", so that lookup gets an index —
-- mirroring the existing tickets_employee_idx for "raised by me".
create index if not exists tickets_assigned_to_idx
  on public.tickets (assigned_to_id);

-- Verify
select
  count(*)                                                as ticket_count,
  count(*) filter (where coalesce(assigned_to_id, '') = '') as unaddressed_legacy_tickets
from public.tickets;
