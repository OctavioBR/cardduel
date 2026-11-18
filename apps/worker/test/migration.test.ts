import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

it("archives populated password accounts and game data without importing identities or losing child rows", async () => {
  const db = env.LEGACY_TEST_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 2));
  await db.exec(
    "INSERT INTO accounts (id, username, username_key, password_hash, password_salt, password_iterations, created_at) VALUES ('old', 'Geralt', 'geralt', 'hash', 'salt', 20000, 0);",
  );
  await db.exec(
    "INSERT INTO sessions VALUES ('old_session', 'old', 0, 99); INSERT INTO records (account_id, wins) VALUES ('old', 3); INSERT INTO decks (id, account_id, name, faction, updated_at) VALUES ('old_deck', 'old', 'My Deck', 'swarm', 0);",
  );
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(2));
  expect(await db.prepare("SELECT id, password_hash FROM legacy_accounts").first()).toEqual({
    id: "old",
    password_hash: "hash",
  });
  expect(await db.prepare("SELECT account_id FROM legacy_decks").first()).toEqual({
    account_id: "old",
  });
  expect(await db.prepare("SELECT wins FROM legacy_records").first()).toEqual({ wins: 3 });
  expect(await db.prepare("SELECT account_id FROM legacy_sessions").first()).toEqual({
    account_id: "old",
  });
  expect(await db.prepare("SELECT COUNT(*) AS n FROM accounts").first()).toEqual({ n: 0 });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
