import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

async function tables(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  ).all<{ name: string }>();
  return results.map((r) => r.name);
}

async function account(id: string, username: string) {
  await env.DB.prepare(
    "INSERT INTO accounts (id, clerk_user_id, display_name, created_at) VALUES (?, ?, ?, 0)",
  )
    .bind(id, id, username)
    .run();
}

describe("D1 schema", () => {
  it("migrations create every table", async () => {
    expect(await tables()).toEqual([
      "accounts",
      "decks",
      "legacy_accounts",
      "legacy_decks",
      "legacy_match_results",
      "legacy_records",
      "legacy_sessions",
      "legacy_sign_in_failures",
      "match_results",
      "records",
    ]);
  });

  it("display names may repeat, while provider identities are unique", async () => {
    await account("a1", "Ada");
    await account("a2", "Ada");
    await expect(
      env.DB.prepare("INSERT INTO accounts VALUES ('other', 'a1', 'Ada', 0)").run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("stores Decks per account and Faction, and rejects unknown Factions", async () => {
    await account("a3", "Bea");
    await env.DB.prepare(
      "INSERT INTO decks (id, account_id, name, faction, leader, cards, updated_at) VALUES ('d1', 'a3', 'Hive', 'swarm', NULL, '[]', 1)",
    ).run();
    const row = await env.DB.prepare(
      "SELECT faction, leader, cards FROM decks WHERE account_id = ?",
    )
      .bind("a3")
      .first();
    expect(row).toEqual({ faction: "swarm", leader: null, cards: "[]" });
    await expect(
      env.DB.prepare(
        "INSERT INTO decks (id, account_id, name, faction, cards, updated_at) VALUES ('d2', 'a3', 'X', 'elves', '[]', 1)",
      ).run(),
    ).rejects.toThrow(/CHECK/);
  });

  it("a match result's outcome and winner agree", async () => {
    await account("p0", "Cy");
    await account("p1", "Di");
    const insert = (id: string, outcome: string, winner: number | null) =>
      env.DB.prepare(
        "INSERT INTO match_results (id, room_code, player0_id, player1_id, faction0, faction1, deck0, deck1, catalog_version, outcome, winner_seat, ended_by, seed, action_log, finished_at) VALUES (?, 'ABC234', 'p0', 'p1', 'swarm', 'court', '{}', '{}', 'v1', ?, ?, 'gems', 1, '[]', 1)",
      )
        .bind(id, outcome, winner)
        .run();
    await insert("m1", "win", 0);
    await insert("m2", "draw", null);
    await expect(insert("m3", "draw", 1)).rejects.toThrow(/CHECK/);
    await expect(insert("m4", "win", null)).rejects.toThrow(/CHECK/);
  });

  it("Records default to zero", async () => {
    await account("r1", "Eve");
    await env.DB.prepare("INSERT INTO records (account_id) VALUES ('r1')").run();
    expect(await env.DB.prepare("SELECT * FROM records WHERE account_id = 'r1'").first()).toEqual({
      account_id: "r1",
      wins: 0,
      losses: 0,
      draws: 0,
      disconnect_wins: 0,
      disconnect_losses: 0,
    });
  });
});
