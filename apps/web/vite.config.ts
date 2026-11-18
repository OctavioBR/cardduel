import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Social previews need absolute URLs. The deploy passes the production origin as SITE_URL;
 * without it (local builds) the tags fall back to root-relative paths.
 */
function siteUrl(): Plugin {
  const origin = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  return {
    name: "site-url",
    transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", origin),
  };
}

// In development the Worker runs under `wrangler dev` on :8787 and Vite proxies the API
// (including Room WebSockets) to it. In production one Worker serves everything (ADR-0001).
export default defineConfig(({ mode }) => ({
  // Only Playwright builds use the local provider UI. Normal builds always ship the real SDK.
  resolve: {
    alias:
      mode === "test"
        ? [
            {
              find: "@clerk/react",
              replacement: fileURLToPath(new URL("./e2e/clerk-fixture.tsx", import.meta.url)),
            },
          ]
        : [],
  },
  plugins: [react(), siteUrl()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", ws: true },
    },
  },
}));
