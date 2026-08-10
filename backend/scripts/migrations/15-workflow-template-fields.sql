-- ============================================================
-- Migration 15: Per-template data fields for Workflow
-- ============================================================
-- A workflow template now defines the data its runs carry — a PO template
-- asks for PO Number / Vendor Name / Total Qty / Location, while another
-- template asks for something else entirely. MD/PC fills those in when
-- starting a run, and the doer sees them on their step card.
--
-- workflow_instances.field_values holds that filled-in data as a JSON array
-- of {label, value} pairs, e.g.
--   [{"label":"PO Number","value":"PO-1042"},{"label":"Qty","value":"500"}]
-- Storing the label alongside the value keeps each run readable on its own,
-- even if the template is later renamed or deleted — a finished run is a
-- permanent record and shouldn't depend on config that still exists.
-- Safe to re-run.
-- ============================================================

create table if not exists public.workflow_template_fields (
  id          text primary key,
  template_id text,
  field_no    text,
  label       text,
  type        text
);
alter table public.workflow_template_fields enable row level security;
create index if not exists workflow_template_fields_template_idx
  on public.workflow_template_fields (template_id);

alter table public.workflow_instances
  add column if not exists field_values text default '';

-- Verify
select count(*) as template_field_count from public.workflow_template_fields;
