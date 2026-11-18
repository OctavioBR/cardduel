import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { type FinishedMatch, writeMatchResult } from "../src/results";

async function fixture(): Promise<FinishedMatch> {
  const players: [string, string] = [crypto.randomUUID(), crypto.randomUUID()];
  for (const id of players) {
    await env.DB.prepare(
      "INSERT INTO accounts (id, clerk_user_id, display_name, created_at) VALUES (?, ?, ?, 0)",
    )
      .bind(id, id, id)
      .run();
    await env.DB.prepare("INSERT INTO records (account_id) VALUES (?)").bind(id).run();
  }
  return {
    id: crypto.randomUUID(),
    roomCode: "ABC234",
    players,
    setup: {
      seed: 17,
      cards: [],
      decks: [
        { faction: "swarm", leader: "leader-a", cards: ["a"] },
        { faction: "court", leader: "leader-b", cards: ["b"] },
      ],
    },
    catalogVersion: "v1",
    log: [{ seat: 0, action: { type: "forfeit" } }],
    result: { outcome: "win", winner: 1, reason: "forfeit" },
    finishedAt: 1234,
  };
}

async function record(id: string) {
  return env.DB.prepare(
    "SELECT wins, losses, draws, disconnect_wins, disconnect_losses FROM records WHERE account_id = ?",
  )
    .bind(id)
    .first();
}
const zero = { wins: 0, losses: 0, draws: 0, disconnect_wins: 0, disconnect_losses: 0 };

describe("Match results and Records", () => {
  it.each(["gems", "forfeit", "disconnect"] as const)(
    "stores %s wins and losses exactly once",
    async (reason) => {
      const match = await fixture();
      match.result = { outcome: "win", winner: 1, reason };
      await writeMatchResult(env.DB, match);
      await writeMatchResult(env.DB, match);
      const row = await env.DB.prepare("SELECT * FROM match_results WHERE id = ?")
        .bind(match.id)
        .first();
      expect(row).toMatchObject({
        room_code: match.roomCode,
        player0_id: match.players[0],
        player1_id: match.players[1],
        faction0: "swarm",
        faction1: "court",
        seed: 17,
        catalog_version: "v1",
        outcome: "win",
        winner_seat: 1,
        ended_by: reason,
        finished_at: 1234,
        deck0: JSON.stringify(match.setup.decks[0]),
        action_log: JSON.stringify(match.log),
      });
      expect(await record(match.players[0])).toEqual({
        ...zero,
        [reason === "disconnect" ? "disconnect_losses" : "losses"]: 1,
      });
      expect(await record(match.players[1])).toEqual({
        ...zero,
        [reason === "disconnect" ? "disconnect_wins" : "wins"]: 1,
      });
    },
  );

  it("writes Draws for both accounts and nothing for a Void Match", async () => {
    const match = await fixture();
    match.result = { outcome: "void" };
    await writeMatchResult(env.DB, match);
    expect(
      await env.DB.prepare("SELECT id FROM match_results WHERE id = ?").bind(match.id).first(),
    ).toBeNull();
    expect(await record(match.players[0])).toEqual(zero);
    match.result = { outcome: "draw" };
    await writeMatchResult(env.DB, match);
    for (const id of match.players) expect(await record(id)).toEqual({ ...zero, draws: 1 });
  });

  it("rolls back Record changes when result insertion fails", async () => {
    const match = await fixture();
    match.catalogVersion = null as unknown as string;
    await expect(writeMatchResult(env.DB, match)).rejects.toThrow();
    for (const id of match.players) expect(await record(id)).toEqual(zero);
  });

  it("recomputing Records from result rows matches stored Records across all endings and concurrent retries", async () => {
    const match = await fixture();
    const endings = [
      { outcome: "win", winner: 0, reason: "gems" },
      { outcome: "win", winner: 1, reason: "forfeit" },
      { outcome: "draw" },
      { outcome: "win", winner: 0, reason: "disconnect" },
      { outcome: "win", winner: 1, reason: "disconnect" },
      { outcome: "void" },
    ] as const;
    for (const result of endings) {
      const finished = { ...match, id: crypto.randomUUID(), result };
      await Promise.all([writeMatchResult(env.DB, finished), writeMatchResult(env.DB, finished)]);
    }
    const { results } = await env.DB.prepare("SELECT * FROM match_results WHERE player0_id = ?")
      .bind(match.players[0])
      .all<{ outcome: string; winner_seat: number | null; ended_by: string }>();
    expect(results).toHaveLength(5);
    for (const seat of [0, 1] as const) {
      const expected = { ...zero };
      for (const row of results) {
        if (row.outcome === "draw") expected.draws++;
        else if (row.ended_by === "disconnect") {
          if (row.winner_seat === seat) expected.disconnect_wins++;
          else expected.disconnect_losses++;
        } else if (row.winner_seat === seat) expected.wins++;
        else expected.losses++;
      }
      expect(await record(match.players[seat])).toEqual(expected);
    }
  });
});
