/// <reference types="node" />
/**
 * One-off script: Restores the 6 attendance records deleted for 2026-07-20.
 *
 * Usage:  npx tsx scripts/restore-today-attendance.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const TODAY = "2026-07-20";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Records from the screenshot (check-in times are IST → converted to approximate ISO)
const RECORDS = [
  { name: "DEEPAK",  status: "Present", checkIn: "09:32" },
  { name: "LIYAQAT", status: "Late",    checkIn: "10:19" },
  { name: "PRIYA",   status: "Present", checkIn: "09:32" },
  { name: "SAMIR",   status: "Present", checkIn: "09:39" },
  { name: "SANDEEP", status: "Present", checkIn: "09:38" },
  { name: "SHIKHA",  status: "Late",    checkIn: "10:13" },
];

function toIso(timeStr: string): string {
  // Convert "HH:mm" IST to full ISO string for today
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(`${TODAY}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);
  return d.toISOString();
}

async function main() {
  console.log("🔄 Looking up employee IDs...");

  const { data: users, error: userErr } = await supabase.from("users").select("id, name").eq("status", "Active");
  if (userErr) { console.error("❌", userErr.message); process.exit(1); }

  const nameToId = new Map<string, string>();
  for (const u of users ?? []) {
    nameToId.set((u.name as string).toUpperCase(), u.id as string);
  }

  const now = new Date().toISOString();
  let restored = 0;

  for (const rec of RECORDS) {
    const empId = nameToId.get(rec.name.toUpperCase());
    if (!empId) {
      console.warn(`⚠️  Employee "${rec.name}" not found in users table, skipping.`);
      continue;
    }

    const lateMinutes = rec.status === "Late"
      ? (() => {
          const parts = rec.checkIn.split(":").map(Number);
          const h = parts[0] ?? 0;
          const m = parts[1] ?? 0;
          const checkedInMin = h * 60 + m;
          const threshold = 9 * 60 + 45; // 09:45 threshold
          return Math.max(0, checkedInMin - threshold);
        })()
      : 0;

    const row = {
      id: `ATT-${TODAY}-${empId}`,
      employee_id: empId,
      date: TODAY,
      check_in: toIso(rec.checkIn),
      check_out: "",
      status: rec.status,
      late_minutes: String(lateMinutes),
      working_minutes: "0",
      early_exit_minutes: "0",
      remarks: "",
      marked_by: empId,
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from("attendance").upsert(row, { onConflict: "employee_id,date" });
    if (error) {
      console.error(`❌ Failed to restore ${rec.name}:`, error.message);
    } else {
      console.log(`✅ Restored: ${rec.name} — ${rec.status} (${rec.checkIn})`);
      restored++;
    }
  }

  console.log(`\n🎉 Restored ${restored}/${RECORDS.length} attendance records for ${TODAY}.`);
}

main();
