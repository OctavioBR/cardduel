import type { Action } from "./actions";
import { type CardId, ROWS, type RowId } from "./cards";
import type { CardRef, MatchEvent } from "./events";
import { legalActions } from "./legal";
import { ref } from "./play";
import {
  type MatchResult,
  type MatchState,
  opponent,
  type Phase,
  type Seat,
  type Uid,
} from "./state";
import { cardIdOf, computeStrengths, rowScore, totalScore } from "./strength";

export interface UnitView extends CardRef {
  strength: number;
}

export interface RowView {
  units: UnitView[];
  horn: CardRef | null;
  score: number;
}

export interface BoardSideView {
  rows: Record<RowId, RowView>;
  score: number;
}

export interface LeaderView {
  cardId: CardId;
  used: boolean;
}

export interface DeckCount {
  cardId: CardId;
  count: number;
}

export interface OwnSideView {
  faction: MatchState["sides"][0]["faction"];
  leader: LeaderView;
  hand: CardRef[];
  /** Your remaining deck, unordered: card ids with counts. */
  deck: DeckCount[];
  deckSize: number;
  discard: CardRef[];
  gems: number;
  passed: boolean;
}

export interface OpponentSideView {
  faction: MatchState["sides"][0]["faction"];
  leader: LeaderView;
  handSize: number;
  deckSize: number;
  discard: CardRef[];
  gems: number;
  passed: boolean;
}

/** Everything one Seat may see and do. The client renders only this (ADR-0002). */
export interface SeatView {
  seat: Seat;
  actionCount: number;
  phase: Phase;
  round: number;
  /** Whose Turn it is, as "you" or "opponent", or null when nobody can act. */
  turn: "you" | "opponent" | null;
  result: MatchResult | null;
  you: OwnSideView;
  opponent: OpponentSideView;
  board: { you: BoardSideView; opponent: BoardSideView };
  weather: CardRef[];
  /**
   * Every action this Seat may take now, fully specified. Forfeit is always allowed while
   * the Match runs and is not listed.
   */
  legalActions: Action[];
}

export function viewFor(state: MatchState, seat: Seat): SeatView {
  const other = opponent(seat);
  const strengths = computeStrengths(state);
  const own = state.sides[seat];
  const opp = state.sides[other];
  return {
    seat,
    actionCount: state.actionCount,
    phase: state.phase,
    round: state.round,
    turn: state.turn === null ? null : state.turn === seat ? "you" : "opponent",
    result: state.result,
    you: {
      faction: own.faction,
      leader: { cardId: own.leader, used: own.leaderUsed },
      hand: own.hand.map((uid) => ref(state, uid)),
      deck: countCards(state, own.deck),
      deckSize: own.deck.length,
      discard: own.discard.map((uid) => ref(state, uid)),
      gems: own.gems,
      passed: own.passed,
    },
    opponent: {
      faction: opp.faction,
      leader: { cardId: opp.leader, used: opp.leaderUsed },
      handSize: opp.hand.length,
      deckSize: opp.deck.length,
      discard: opp.discard.map((uid) => ref(state, uid)),
      gems: opp.gems,
      passed: opp.passed,
    },
    board: {
      you: boardSide(state, seat, strengths),
      opponent: boardSide(state, other, strengths),
    },
    weather: state.weather.map((uid) => ref(state, uid)),
    legalActions: legalActions(state, seat),
  };
}

function boardSide(state: MatchState, seat: Seat, strengths: Map<Uid, number>): BoardSideView {
  const rows = {} as Record<RowId, RowView>;
  for (const row of ROWS) {
    const rowState = state.sides[seat].rows[row];
    rows[row] = {
      units: rowState.units.map((uid) => ({
        ...ref(state, uid),
        strength: strengths.get(uid) ?? 0,
      })),
      horn: rowState.horn === null ? null : ref(state, rowState.horn),
      score: rowScore(state, seat, row, strengths),
    };
  }
  return { rows, score: totalScore(state, seat, strengths) };
}

/** Sorted by card id so the list says nothing about deck order. */
function countCards(state: MatchState, uids: Uid[]): DeckCount[] {
  const counts = new Map<CardId, number>();
  for (const uid of uids) {
    const id = cardIdOf(state, uid);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([cardId, count]) => ({ cardId, count }));
}

/** Removes hidden information from events for one Seat (ADR-0002). */
export function filterEvents(events: readonly MatchEvent[], seat: Seat): MatchEvent[] {
  return events.map((event) => {
    if (event.type === "drew" && event.seat !== seat) {
      return { type: "drew", seat: event.seat, count: event.count };
    }
    return event;
  });
}
