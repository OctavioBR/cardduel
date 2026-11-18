import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { publicKey, publishableKey } from "../../tools/testing/clerk";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Tests use a tiny fixture shell so they don't depend on a client build.
        assets: { directory: "./test/assets" },
        d1Databases: ["LEGACY_TEST_DB"],
        // Migrations are applied to the local test D1 before the tests run.
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          CLERK_PUBLISHABLE_KEY: publishableKey,
          CLERK_JWT_KEY: publicKey,
          CLERK_SECRET_KEY: "sk_test_fixture_only",
          APP_ORIGIN: "https://card-duel.test",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
