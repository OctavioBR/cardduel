import { applyD1Migrations, env } from "cloudflare:test";

// Every test file starts from a fresh local D1 with all migrations applied.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
