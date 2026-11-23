// `pnpm clean`: delete installed dependencies and generated files so the next `pnpm install` and
// build start from scratch. Local settings such as .env.local and .dev.vars are kept.
import { globSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const generated = [
  "**/node_modules",
  "**/dist",
  "apps/web/dist-e2e",
  "**/.wrangler",
  "**/coverage",
  "**/test-results",
  "**/playwright-report",
  "**/*.tsbuildinfo",
  "apps/worker/worker-configuration.d.ts",
  "apps/worker/wrangler.e2e.json",
  "apps/worker/wrangler.preview-db.json",
];

const matches = globSync(generated, {
  cwd: root,
  // Don't walk into dependencies or .git: a matched node_modules goes as a whole.
  exclude: ["**/node_modules/**", ".git/**"],
});
for (const path of matches) {
  rmSync(join(root, path), { recursive: true, force: true });
  console.log(`Removed ${path}`);
}
if (matches.length === 0) console.log("Nothing to clean.");
