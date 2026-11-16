import { defineConfig, devices } from "@playwright/test";

const VITE_PORT = 5173;
const WORKER_PORT = 8787;

/**
 * Two kinds of end-to-end tests:
 * - local-room: the Local Room on the Vite dev server (fast, no Worker).
 * - online: two browser contexts against the local Worker serving the built client.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "local-room",
      testMatch: /(local-room|gallery|stage|preview|choices)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${VITE_PORT}` },
    },
    {
      name: "online",
      testMatch: /online\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${WORKER_PORT}` },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --port ${VITE_PORT} --strictPort`,
      url: `http://localhost:${VITE_PORT}/dev/local`,
      reuseExistingServer: !process.env.CI,
    },
    ...(process.env.E2E_SKIP_WORKER
      ? []
      : [
          {
            command: `pnpm exec vite build && pnpm --filter @card-duel/worker exec wrangler dev --port ${WORKER_PORT}`,
            url: `http://localhost:${WORKER_PORT}/api/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]),
  ],
});
