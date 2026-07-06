import "dotenv/config";
import { runBackupJob } from "../src/scheduler/backupJob";

/** Runs the Supabase -> Google Sheets backup once, on demand. */
runBackupJob()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
