/// <reference types="node" />
/**
 * One-off script: Deletes ALL attendance records EXCEPT today (2026-07-20).
 *
 * Usage:  npx tsx scripts/clear-old-attendance.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const KEEP_DATE = "2026-07-20"; // Today's date — these rows survive

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
  console.log(`🗑️  Deleting all attendance records EXCEPT date = "${KEEP_DATE}" ...`);

  const { data, error } = await supabase
    .from("attendance")
    .delete()
    .neq("date", KEEP_DATE)   // keep today, delete everything else
    .select("id");

  if (error) {
    console.error("❌ Supabase error:", error.message);
    process.exit(1);
  }

  console.log(`✅ Deleted ${data?.length ?? 0} old attendance records.`);
  console.log(`📌 Only "${KEEP_DATE}" attendance rows remain.`);
}

main();
