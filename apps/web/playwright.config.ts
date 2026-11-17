import { defineConfig, devices } from "@playwright/test";

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5173);
/**
 * Fixed Match seed for the local Worker only (never deployed): with the two Starter Decks it deals
 * Seat 0 a Brood Tender (Medic) and Wildfire (Scorch) in the opening hand, and Seat 0 plays first.
 */
const E2E_SEED = 29;
const WORKER_PORT = Number(process.env.E2E_WORKER_PORT ?? 8787);

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
      testMatch:
        /(local-room|gallery|stage|preview|choices|drag|card-detail|animations|flow|accessibility-local)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${VITE_PORT}` },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices["iPhone 13 landscape"],
        defaultBrowserType: "chromium",
        baseURL: `http://localhost:${VITE_PORT}`,
      },
    },
    {
      name: "online",
      testMatch: /(online|deck-builder|disconnect|home|accessibility-online|two-players)\.spec\.ts/,
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
            command: `pnpm exec vite build && pnpm --filter @card-duel/worker exec wrangler d1 migrations apply DB --local && pnpm --filter @card-duel/worker exec wrangler dev --port ${WORKER_PORT} --var E2E_SEED:${E2E_SEED}`,
            url: `http://localhost:${WORKER_PORT}/api/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]),
  ],
});
