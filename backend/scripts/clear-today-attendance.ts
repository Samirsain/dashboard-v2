/// <reference types="node" />
/**
 * One-off script: Deletes ALL attendance records for today (2026-07-20).
 *
 * Usage:  npx tsx scripts/clear-today-attendance.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const TODAY = "2026-07-20";

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`🗑️  Deleting all attendance records for date = "${TODAY}" ...`);

  const { data, error } = await supabase
    .from("attendance")
    .delete()
    .eq("date", TODAY)
    .select("id");

  if (error) {
    console.error("❌ Supabase error:", error.message);
    process.exit(1);
  }

  console.log(`✅ Deleted ${data?.length ?? 0} attendance records for ${TODAY}.`);
}

main();
