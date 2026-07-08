"use client";

import { useEffect } from "react";

/**
 * Dev-only Reticle bridge: lets a Claude Code agent (with the Reticle MCP
 * server configured) observe/verify this running app over MCP instead of
 * screenshots — see reticlehq/reticle. Tree-shaken out of production builds
 * because the whole component body is gated on NODE_ENV.
 */
export default function ReticleInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    import("@reticlehq/core").then((mod) => {
      // @reticlehq/core's .d.ts re-exports from @reticlehq/browser without
      // shipping that package's own types, so `reticle` is missing from the
      // generated type — it's present at runtime (verified against dist/index.js).
      const { reticle } = mod as typeof mod & {
        reticle: { connect: (opts: { session: string }) => void };
      };
      reticle.connect({ session: "dashboard-v2" });
    });
  }, []);

  return null;
}
