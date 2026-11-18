import { readFileSync, writeFileSync } from "node:fs";
import { publicKey, publishableKey } from "../../../tools/testing/clerk";
export function writeWorkerConfig(port: number, seed: number) {
  // Wrangler inherits paths relative to this file, which sits beside the real config.
  const text = readFileSync(new URL("../../worker/wrangler.jsonc", import.meta.url), "utf8");
  const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
  config.assets.directory = "../web/dist-e2e";
  config.vars = {
    CLERK_PUBLISHABLE_KEY: publishableKey,
    CLERK_JWT_KEY: publicKey,
    CLERK_SECRET_KEY: "sk_test_fixture_only",
    APP_ORIGIN: `http://localhost:${port}`,
    E2E_SEED: seed,
  };
  writeFileSync(new URL("../../worker/wrangler.e2e.json", import.meta.url), JSON.stringify(config));
}
