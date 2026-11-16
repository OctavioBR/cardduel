import type { Action } from "./actions";
import { ROWS, type RowId, type UnitDefinition } from "./cards";
import type { MatchState, Seat } from "./state";
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
  if (state.phase !== "turns" || state.turn !== seat) return [];
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
      case "scorch":
        // Arrive with their own slices.
        break;
    }
  }
  actions.push({ type: "pass" });
  return actions;
}

export function hornSlotEmpty(state: MatchState, seat: Seat, row: RowId): boolean {
  const rowState = state.sides[seat].rows[row];
  return rowState.horn === null && !rowState.leaderHorn;
}
