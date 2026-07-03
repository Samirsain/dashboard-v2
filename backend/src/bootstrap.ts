import { setDefaultResultOrder } from "node:dns";

/**
 * Force IPv4-first DNS resolution, in-process, before anything opens a
 * socket. Container platforms (Railway, Fly, some Cloud Run configs) hand
 * the app a dual-stack interface where the IPv6 route to Google's OAuth
 * token endpoint (oauth2.googleapis.com / www.googleapis.com) intermittently
 * drops the connection mid-response — surfacing as "Invalid response body ...
 * Premature close" during token exchange. Preferring IPv4 avoids that path.
 *
 * This is the code-level equivalent of NODE_OPTIONS=--dns-result-order=
 * ipv4first, done here so it always applies regardless of how the host is
 * configured. Must be imported first, before any Google client is created.
 */
try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Older Node without this API — safe to ignore.
}
