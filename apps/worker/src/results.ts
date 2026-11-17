import type { LoggedAction, MatchResult, MatchSetup, Seat } from "@card-duel/engine";

export type RoomResult =
  | MatchResult
  | { outcome: "win"; winner: Seat; reason: "disconnect" }
  | { outcome: "void" };

export interface FinishedMatch {
  id: string;
  roomCode: string;
  players: [string, string];
  setup: MatchSetup;
  catalogVersion: string;
  log: LoggedAction[];
  result: RoomResult;
  finishedAt: number;
}

/** One transaction: a retry after eviction or a lost response never counts twice. */
export async function writeMatchResult(db: D1Database, match: FinishedMatch): Promise<void> {
  const { result } = match;
  if (result.outcome === "void") return;
  const winner = result.outcome === "win" ? result.winner : null;
  const reason = result.outcome === "win" ? result.reason : "gems";
  const records = match.players.map((accountId, seat) => {
    const won = winner === seat;
    const draw = result.outcome === "draw";
    const disconnected = reason === "disconnect";
    return db
      .prepare(`
      INSERT INTO records (account_id, wins, losses, draws, disconnect_wins, disconnect_losses)
      SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM match_results WHERE id = ?)
      ON CONFLICT(account_id) DO UPDATE SET
        wins = wins + excluded.wins, losses = losses + excluded.losses,
        draws = draws + excluded.draws,
        disconnect_wins = disconnect_wins + excluded.disconnect_wins,
        disconnect_losses = disconnect_losses + excluded.disconnect_losses
    `)
      .bind(
        accountId,
        Number(!draw && won && !disconnected),
        Number(!draw && !won && !disconnected),
        Number(draw),
        Number(disconnected && won),
        Number(disconnected && !won),
        match.id,
      );
  });
  await db.batch([
    ...records,
    db
      .prepare(`
    INSERT INTO match_results (id, room_code, player0_id, player1_id, faction0, faction1,
      deck0, deck1, catalog_version, outcome, winner_seat, ended_by, seed, action_log, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `)
      .bind(
        match.id,
        match.roomCode,
        ...match.players,
        match.setup.decks[0].faction,
        match.setup.decks[1].faction,
        JSON.stringify(match.setup.decks[0]),
        JSON.stringify(match.setup.decks[1]),
        match.catalogVersion,
        result.outcome,
        winner,
        reason,
        match.setup.seed,
        JSON.stringify(match.log),
        match.finishedAt,
      ),
  ]);
}
