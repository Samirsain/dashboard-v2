import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabaseCredentials } from "./env";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

/**
 * Lazily-created Supabase client used as the application's primary database.
 *
 * We use the service_role key here: this runs only on the trusted Express
 * backend (never in the browser), so it bypasses Row Level Security and talks
 * to Postgres directly through PostgREST. Auth/permissions are enforced by our
 * own JWT + role middleware, not by Supabase RLS.
 *
 * Construction is lazy so the process can still boot and answer health checks
 * even if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't set yet.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  if (!hasSupabaseCredentials()) {
    throw AppError.serviceUnavailable(
      "Supabase credentials are not configured. Set SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in your environment."
    );
  }

  client = createClient(env.supabase.url!, env.supabase.serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  logger.info("Supabase client initialized (service role)");
  return client;
}
