import "dotenv/config";
import { getSupabase } from "../src/config/supabase";

async function main() {
  const sb = getSupabase();

  // Delete the Daily Checklist that was mistakenly added
  const { error } = await sb
    .from("lists")
    .delete()
    .eq("id", "LST-19F50558646");

  if (error) {
    console.error("Delete failed:", error.message);
    process.exit(1);
  }

  console.log("✅ Deleted 'Daily Checklist' (LST-19F50558646)");

  // Verify remaining lists
  const { data } = await sb.from("lists").select("id, name, type");
  console.log("\nRemaining lists:");
  console.table(data?.map((l) => ({ id: l.id, name: l.name, type: l.type })));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
