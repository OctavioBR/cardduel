import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Tests use a tiny fixture shell so they don't depend on a client build.
      miniflare: { assets: { directory: "./test/assets" } },
    }),
  ],
});
