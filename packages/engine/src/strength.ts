import { ROWS, type RowId } from "./cards";
import type { MatchState, Seat, Uid } from "./state";

/** Current Strength of every Unit on the battlefield, keyed by uid. */
export function computeStrengths(state: MatchState): Map<Uid, number> {
  const result = new Map<Uid, number>();
  for (const side of state.sides) {
    for (const row of ROWS) {
      for (const uid of side.rows[row].units) {
        const def = state.defs[cardIdOf(state, uid)];
        result.set(uid, def?.kind === "unit" ? def.strength : 0);
      }
    }
  }
  return result;
}

export function rowScore(
  state: MatchState,
  seat: Seat,
  row: RowId,
  strengths = computeStrengths(state),
): number {
  let total = 0;
  for (const uid of state.sides[seat].rows[row].units) total += strengths.get(uid) ?? 0;
  return total;
}

export function totalScore(
  state: MatchState,
  seat: Seat,
  strengths = computeStrengths(state),
): number {
  return ROWS.reduce((sum, row) => sum + rowScore(state, seat, row, strengths), 0);
}

export function cardIdOf(state: MatchState, uid: Uid): string {
  const card = state.cards[uid];
  if (!card) throw new Error(`Unknown card uid ${uid}`);
  return card.cardId;
}
