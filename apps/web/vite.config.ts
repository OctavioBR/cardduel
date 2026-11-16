import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the Worker runs under `wrangler dev` on :8787 and Vite proxies the API
// (including Room WebSockets) to it. In production one Worker serves everything (ADR-0001).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", ws: true },
    },
  },
});
