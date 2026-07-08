import type { NextConfig } from "next";

// Note: @reticlehq/core/next's withReticle() injects a webpack config for
// DOM -> file:line source-mapping, which conflicts with Turbopack (this
// project's dev/build engine as of Next 16) and crashes `next dev`. Skipped —
// Reticle's runtime SDK (see ReticleInit) still works for
// API/DOM/console/signal verification without it.
const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
