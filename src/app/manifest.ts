import type { MetadataRoute } from "next";

/** Lets Android and iOS install the dashboard to the home screen as an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThirtyMilestones",
    // Home-screen labels truncate past ~12 characters.
    short_name: "Milestones",
    description: "Task management system",
    start_url: "/",
    display: "standalone",
    // White splash matches the icon's white field; theme matches MobileHeader (bg-surface).
    background_color: "#ffffff",
    theme_color: "#f9f9f9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
