import type { Action } from "./actions";
import { ROWS, type RowId } from "./cards";
import type { CardRef, MatchEvent } from "./events";
import { cloneState, resolve } from "./match";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
import { computeStrengths, rowScore, totalScore } from "./strength";

/** A Unit whose Strength the candidate play would set or change. */
export interface PreviewUnit {
  /** Absent for a card that would come from your own deck (deck uids stay hidden). */
  uid?: Uid;
  cardId: string;
  side: "you" | "opponent";
  row: RowId;
  /** Current Strength, or null if the card is not on the battlefield yet. */
  from: number | null;
  to: number;
}

/**
 * The predicted outcome of a candidate play (GLOSSARY.md: Play Preview), computed on the
 * server (ADR-0002). Draws are a count, never cards.
 */
export interface PlayPreview {
  units: PreviewUnit[];
  rows: { you: Record<RowId, number>; opponent: Record<RowId, number> };
  totals: { you: number; opponent: number };
  destroyed: CardRef[];
  /** Cards this play would return from the battlefield to your hand (Decoy). */
  returned: CardRef[];
  /** How many cards you would draw. */
  drawn: number;
}

/** Actions that get a Play Preview: plays, Leader abilities and Pending Choice options. */
export function hasPreview(action: Action): boolean {
  return action.type === "play" || action.type === "leader" || action.type === "choose";
}

/**
 * Runs the action's effect on a copy of the state, up to its resolution (no Turn handoff,
 * no Round end), and summarises what changed for `seat`.
 */
export function previewFor(state: MatchState, seat: Seat, action: Action): PlayPreview {
  const before = computeStrengths(state);
  const ownDeck = new Set(state.sides[seat].deck);
  const sim = cloneState(state);
  const events: MatchEvent[] = [];
  resolve(sim, seat, action, events);
  const after = computeStrengths(sim);

  const units: PreviewUnit[] = [];
  for (const sideSeat of [seat, opponent(seat)] as const) {
    for (const row of ROWS) {
      for (const uid of sim.sides[sideSeat].rows[row].units) {
        const to = after.get(uid) ?? 0;
        const from = before.has(uid) && onBattlefield(state, uid) ? (before.get(uid) ?? 0) : null;
        if (from === to) continue;
        const card = sim.cards[uid];
        units.push({
          ...(ownDeck.has(uid) ? {} : { uid }),
          cardId: card?.cardId ?? "",
          side: sideSeat === seat ? "you" : "opponent",
          row,
          from,
          to,
        });
      }
    }
  }

  const rowsFor = (s: Seat) =>
    Object.fromEntries(ROWS.map((row) => [row, rowScore(sim, s, row, after)])) as Record<
      RowId,
      number
    >;
  let drawn = 0;
  const destroyed: CardRef[] = [];
  const returned: CardRef[] = [];
  for (const e of events) {
    if (e.type === "drew" && e.seat === seat) drawn += e.count;
    if (e.type === "destroyed") destroyed.push(...e.cards);
    if (e.type === "returnedToHand" && e.seat === seat && onBattlefield(state, e.card.uid)) {
      returned.push(e.card);
    }
  }
  return {
    units,
    rows: { you: rowsFor(seat), opponent: rowsFor(opponent(seat)) },
    totals: { you: totalScore(sim, seat, after), opponent: totalScore(sim, opponent(seat), after) },
    destroyed,
    returned,
    drawn,
  };
}

function onBattlefield(state: MatchState, uid: Uid): boolean {
  return state.sides.some((side) => ROWS.some((row) => side.rows[row].units.includes(uid)));
}
