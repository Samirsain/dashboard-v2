/**
 * IMS (Inventory Management System) needs two new Supabase tables.
 * The Supabase JS client can't run arbitrary DDL, so — same as
 * add-tickets-table.ts — this just prints the SQL to paste into the
 * Supabase SQL Editor (Project -> SQL Editor -> New query -> Run).
 *
 * This does NOT touch any existing table — safe to run any time.
 *
 * Usage:  npx tsx scripts/add-ims-tables.ts
 */

const sql = `
create table if not exists public.ims_items (
  id                     text primary key,        -- = sku_code
  sku_code               text unique not null,
  item_name              text not null,
  category               text not null,
  avg_daily_consumption  numeric not null default 0,
  lead_time              numeric not null default 0,
  safety_factor          numeric not null default 1,
  moq                    numeric not null default 0,
  base_max_level         numeric not null default 0,
  material_in_transit    numeric not null default 0,
  created_at             text,
  updated_at             text
);

create table if not exists public.ims_transactions (
  id          text primary key,
  sku_code    text not null references public.ims_items(id) on delete cascade,
  direction   text not null check (direction in ('In', 'Out')),
  date        text not null,               -- YYYY-MM-DD
  quantity    numeric not null,
  "timestamp" text,
  created_by  text
);

create index if not exists ims_transactions_sku_idx on public.ims_transactions (sku_code);
create index if not exists ims_transactions_date_idx on public.ims_transactions (date);
`;

console.log("Paste this into the Supabase SQL Editor and run it:\n");
console.log(sql);
