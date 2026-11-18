import type { Action } from "./actions";
import { ROWS, type RowId, type UnitDefinition } from "./cards";
import { choiceOptions } from "./choice";
import { leaderActions } from "./leader";
import type { MatchState, Seat, Uid } from "./state";
import { defOf } from "./strength";

/** Rows a Unit may be played to from the hand. */
export function playableRows(def: UnitDefinition): RowId[] {
  return def.abilities.includes("agile") ? ["close", "ranged"] : [def.row];
}

/**
 * Every action the Seat may take now, each fully specified (card, Row, target). This is
 * the single definition of what is legal: `applyAction` accepts exactly these (plus
 * Forfeit, which is always allowed while the Match runs and is not listed).
 */
export function legalActions(state: MatchState, seat: Seat): Action[] {
  if (state.phase === "redraw") return redrawActions(state, seat);
  if (state.phase !== "turns" || state.turn !== seat) return [];
  const pending = state.pending[0];
  if (pending) return pending.seat === seat ? choiceOptions(state, pending) : [];
  const side = state.sides[seat];
  if (side.passed) return [];
  const actions: Action[] = [];
  for (const uid of side.hand) {
    const def = defOf(state, uid);
    if (def.kind === "unit") {
      for (const row of playableRows(def)) actions.push({ type: "play", card: uid, row });
      continue;
    }
    if (def.kind !== "special") continue;
    switch (def.effect.type) {
      case "weather":
      case "clearWeather":
        actions.push({ type: "play", card: uid });
        break;
      case "horn":
        for (const row of ROWS) {
          if (hornSlotEmpty(state, seat, row)) actions.push({ type: "play", card: uid, row });
        }
        break;
      case "decoy":
        for (const target of decoyTargets(state, seat)) {
          actions.push({ type: "play", card: uid, target });
        }
        break;
      case "scorch":
        actions.push({ type: "play", card: uid });
        break;
    }
  }
  actions.push(...leaderActions(state, seat));
  actions.push({ type: "pass" });
  return actions;
}

/**
 * Whether the Match is waiting on the Seat: its Redraw, its Turn or its Pending Choice.
 * This is when its Turn Timer runs (GLOSSARY.md: Turn Timer).
 */
export function waitingOn(state: MatchState, seat: Seat): boolean {
  if (state.phase === "redraw") return !state.sides[seat].redraw.done;
  return state.phase === "turns" && state.turn === seat;
}

/**
 * What doing nothing would do when the Seat's Turn Timer runs out (ADR-0009): keep the hand
 * in Redraw, take the first option of a Pending Choice, otherwise Pass. Null when the Match
 * is not waiting on the Seat.
 */
export function timedOutAction(state: MatchState, seat: Seat): Action | null {
  if (!waitingOn(state, seat)) return null;
  if (state.phase === "redraw") return { type: "confirmRedraw" };
  const pending = state.pending[0];
  if (pending) return pending.seat === seat ? (choiceOptions(state, pending)[0] ?? null) : null;
  return { type: "pass" };
}

/** Most cards a Seat may return during Redraw. */
export const MAX_REDRAW = 2;

/** During Redraw both Seats act at once: return a hand card, or confirm. */
function redrawActions(state: MatchState, seat: Seat): Action[] {
  const side = state.sides[seat];
  if (side.redraw.done) return [];
  return [
    ...side.hand.map((card): Action => ({ type: "redraw", card })),
    { type: "confirmRedraw" },
  ];
}

/**
 * Units a Decoy may swap with: non-Hero Units on your own side of the battlefield,
 * including an opponent's Spy sitting there.
 */
export function decoyTargets(state: MatchState, seat: Seat): Uid[] {
  const targets: Uid[] = [];
  for (const row of ROWS) {
    for (const uid of state.sides[seat].rows[row].units) {
      const def = defOf(state, uid);
      if (def.kind === "unit" && !def.hero) targets.push(uid);
    }
  }
  return targets;
}

export function hornSlotEmpty(state: MatchState, seat: Seat, row: RowId): boolean {
  const rowState = state.sides[seat].rows[row];
  return rowState.horn === null && !rowState.leaderHorn;
}
