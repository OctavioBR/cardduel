import { type CardDefinition, type PassiveLeaderKind, ROWS, type RowId } from "./cards";
import type { MatchState, Seat, Uid } from "./state";

export function cardIdOf(state: MatchState, uid: Uid): string {
  const card = state.cards[uid];
  if (!card) throw new Error(`Unknown card uid ${uid}`);
  return card.cardId;
}

export function defOf(state: MatchState, uid: Uid): CardDefinition {
  const def = state.defs[cardIdOf(state, uid)];
  if (!def) throw new Error(`No definition for card uid ${uid}`);
  return def;
}

/** Rows covered by the Weather cards currently in play. */
export function weatheredRows(state: MatchState): Set<RowId> {
  const rows = new Set<RowId>();
  for (const uid of state.weather) {
    const def = defOf(state, uid);
    if (def.kind === "special" && def.effect.type === "weather") {
      for (const row of def.effect.rows) rows.add(row);
    }
  }
  return rows;
}

function passiveOf(state: MatchState, seat: Seat): PassiveLeaderKind | null {
  const leader = state.defs[state.sides[seat].leader];
  return leader?.kind === "leader" && leader.ability.type === "passive"
    ? leader.ability.passive
    : null;
}

/**
 * Strength a non-Hero Unit keeps under Weather on this Seat's Row, or null when Weather does
 * not lower it: 1, or half its printed Strength rounded up under Storm-Hardened. Steady
 * Ground shields the Siege Row.
 */
function weatheredStrength(
  state: MatchState,
  seat: Seat,
  row: RowId,
  weathered: Set<RowId>,
  printed: number,
): number | null {
  if (!weathered.has(row)) return null;
  const passive = passiveOf(state, seat);
  if (passive === "steadyGround" && row === "siege") return null;
  if (passive === "stormHardened") return Math.max(1, Math.ceil(printed / 2));
  return 1;
}

/**
 * Current Strength of every card in a battlefield Row, keyed by uid. Recomputed from the
 * battlefield in this order: Weather, Tight Bond, Morale Boost, Horn. Heroes ignore all of
 * them; cards that are not Units (a Decoy) count 0.
 */
export function computeStrengths(state: MatchState): Map<Uid, number> {
  const result = new Map<Uid, number>();
  const weathered = weatheredRows(state);
  for (const [seat, side] of state.sides.entries()) {
    for (const row of ROWS) {
      const rowState = side.rows[row];
      const units = rowState.units.map((uid) => ({ uid, def: defOf(state, uid) }));
      const moraleSources = units.filter(
        ({ def }) => def.kind === "unit" && def.abilities.includes("moraleBoost"),
      );
      const hornUnits = units.filter(
        ({ def }) => def.kind === "unit" && def.abilities.includes("horn"),
      );
      const hornSlot = rowState.horn !== null || rowState.leaderHorn;
      for (const { uid, def } of units) {
        if (def.kind !== "unit") {
          result.set(uid, 0);
          continue;
        }
        if (def.hero) {
          result.set(uid, def.strength);
          continue;
        }
        let strength =
          weatheredStrength(state, seat as Seat, row, weathered, def.strength) ?? def.strength;
        if (def.abilities.includes("tightBond")) {
          strength *= units.filter((u) => u.def.id === def.id).length;
        }
        strength += moraleSources.filter((m) => m.uid !== uid).length;
        // A Row is doubled at most once. A Horn Unit is not doubled by its own Horn.
        if (hornSlot || hornUnits.some((h) => h.uid !== uid)) strength *= 2;
        result.set(uid, strength);
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
