import "./bootstrap"; // must be first — sets IPv4-first DNS before any socket opens
import { createApp } from "./app";
import { env, hasGoogleCredentials, hasSupabaseCredentials } from "./config/env";
import { logger } from "./utils/logger";
import { startScheduler, stopScheduler } from "./scheduler";

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`Server listening on port ${env.port} (${env.nodeEnv})`);
  if (!hasSupabaseCredentials()) {
    logger.warn(
      "Supabase credentials are not set — database-backed endpoints will return 503 " +
        "until SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are added to the environment"
    );
  }
  if (!hasGoogleCredentials()) {
    logger.warn(
      "Google Sheets credentials are not set — the daily Sheets backup will be skipped"
    );
  }
  startScheduler();
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopScheduler();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
