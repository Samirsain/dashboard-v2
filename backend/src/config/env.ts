import "dotenv/config";

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function requiredAtRuntime(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "4000")),
  corsOrigin: optional("CORS_ORIGIN", "*"),

  jwt: {
    secret: optional("JWT_SECRET", "dev-insecure-secret-change-me"),
    expiresIn: optional("JWT_EXPIRES_IN", "8h"),
  },

  google: {
    // Preferred: full service account JSON as a single env var (escaped).
    serviceAccountJson: requiredAtRuntime("GOOGLE_SERVICE_ACCOUNT_JSON"),
    // Alternative: separate email / private key pair.
    serviceAccountEmail: requiredAtRuntime("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: requiredAtRuntime("GOOGLE_PRIVATE_KEY")?.replace(/\\n/g, "\n"),
    // Alternative: path to a service account key file on disk.
    applicationCredentialsPath: requiredAtRuntime("GOOGLE_APPLICATION_CREDENTIALS"),
  },

  scheduler: {
    enabled: optional("SCHEDULER_ENABLED", "true") === "true",
    // Cron expression for the daily checklist/overdue job. Default: 00:01 every day.
    dailyCron: optional("SCHEDULER_DAILY_CRON", "1 0 * * *"),
    timezone: optional("SCHEDULER_TIMEZONE", "Asia/Kolkata"),
  },

  logLevel: optional("LOG_LEVEL", "info"),
};

export function hasGoogleCredentials(): boolean {
  return Boolean(
    env.google.serviceAccountJson ||
      (env.google.serviceAccountEmail && env.google.privateKey) ||
      env.google.applicationCredentialsPath
  );
}
