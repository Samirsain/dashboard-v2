import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase config.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = `
create table if not exists public.tickets (
  id              text primary key,
  employee_id     text,
  employee_name   text,
  department      text,
  title           text,
  description     text,
  solution_option1 text,
  solution_option2 text,
  blanket_required text,
  priority        text,
  attachment_url  text,
  status          text,
  solution        text,
  created_at      text,
  updated_at      text
);
create index if not exists tickets_status_idx on public.tickets (status);
`;

async function run() {
  const { error } = await supabase.rpc('exec_sql', { sql_string: sql }).catch((e: any) => ({ error: e }));
  // Standard Supabase doesn't have an exec_sql RPC out of the box unless added.
  // Instead, since we can't run arbitrary DDL through the JS client easily,
  // I will just ask the user to run it in the Supabase SQL editor, or...
  console.log("SQL to execute in Supabase SQL Editor:");
  console.log(sql);
}

run();
