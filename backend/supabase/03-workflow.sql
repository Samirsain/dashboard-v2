-- ---------------------------------------------------------------------------
-- Feature: Workflow Monitoring System (WFMS) — templates, steps, instances,
-- step events (the live Planned/Actual/Status/Delay per step of each run).
-- Run this ONCE in Supabase -> SQL Editor, BEFORE deploying the workflow code.
-- Safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.workflow_templates (
  id         text primary key,
  name       text,
  created_at text
);
alter table public.workflow_templates enable row level security;

create table if not exists public.workflow_steps (
  id          text primary key,
  template_id text,
  step_no     text,
  what        text,
  doer_id     text,
  how         text,
  tat         text
);
alter table public.workflow_steps enable row level security;
create index if not exists workflow_steps_template_idx on public.workflow_steps (template_id);

create table if not exists public.workflow_instances (
  id           text primary key,
  template_id  text,
  title        text,
  details      text default '',
  started_at   text,
  status       text,
  requested_by text
);
alter table public.workflow_instances enable row level security;
alter table public.workflow_instances add column if not exists details text default '';

create table if not exists public.workflow_step_events (
  id            text primary key,
  instance_id   text,
  step_no       text,
  what          text,
  doer_id       text,
  how           text,
  tat           text,
  planned       text,
  actual        text,
  status        text,
  rework_count  text default '0'
);
alter table public.workflow_step_events enable row level security;
create index if not exists workflow_step_events_instance_idx on public.workflow_step_events (instance_id);
