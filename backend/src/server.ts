import "./bootstrap"; // must be first — sets IPv4-first DNS before any socket opens
import { createApp } from "./app";
import { env, hasGoogleCredentials } from "./config/env";
import { logger } from "./utils/logger";
import { startScheduler, stopScheduler } from "./scheduler";

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`Server listening on port ${env.port} (${env.nodeEnv})`);
  if (!hasGoogleCredentials()) {
    logger.warn(
      "Google Sheets credentials are not set — Sheets-backed endpoints will return 503 " +
        "until GOOGLE_SERVICE_ACCOUNT_JSON (or equivalent) is added to .env"
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
