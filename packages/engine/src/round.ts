import { ROWS } from "./cards";
import type { CardRef, MatchEvent } from "./events";
import { discardToOwner, ref } from "./play";
import { type MatchResult, type MatchState, opponent, SEATS, type Seat } from "./state";
import { computeStrengths, totalScore } from "./strength";

/** Whether the Seat could still use an active Leader ability. Wired up with Leader abilities. */
export function leaderUsable(_state: MatchState, _seat: Seat): boolean {
  return false;
}

/** Hands the Turn on after `actor` has acted, ending the Round when both have Passed. */
export function afterTurn(state: MatchState, actor: Seat, events: MatchEvent[]): void {
  if (state.phase === "ended") return;
  const other = opponent(actor);
  if (state.sides[actor].passed && state.sides[other].passed) {
    endRound(state, events);
    return;
  }
  beginTurn(state, state.sides[other].passed ? actor : other, events);
}

/** Gives `seat` the Turn, Passing it automatically when it has nothing it could do. */
export function beginTurn(state: MatchState, seat: Seat, events: MatchEvent[]): void {
  state.turn = seat;
  const side = state.sides[seat];
  if (!side.passed && side.hand.length === 0 && !leaderUsable(state, seat)) {
    side.passed = true;
    events.push({ type: "passed", seat, auto: true });
    afterTurn(state, seat, events);
  }
}

function endRound(state: MatchState, events: MatchEvent[]): void {
  const strengths = computeStrengths(state);
  const scores: [number, number] = [
    totalScore(state, 0, strengths),
    totalScore(state, 1, strengths),
  ];
  let winner: Seat | null = null;
  if (scores[0] > scores[1]) winner = 0;
  else if (scores[1] > scores[0]) winner = 1;

  for (const seat of SEATS) {
    if (winner !== seat) state.sides[seat].gems -= 1;
  }
  const gems: [number, number] = [state.sides[0].gems, state.sides[1].gems];
  events.push({ type: "roundEnded", round: state.round, scores, winner, gems });

  clearBattlefield(state, events);

  const out0 = gems[0] <= 0;
  const out1 = gems[1] <= 0;
  if (out0 && out1) {
    endMatch(state, { outcome: "draw" }, events);
    return;
  }
  if (out0 || out1) {
    endMatch(state, { outcome: "win", winner: out0 ? 1 : 0, reason: "gems" }, events);
    return;
  }

  // The Round winner starts the next Round; after a Tie, the Seat that did not start does.
  const starter: Seat = winner ?? opponent(state.roundStarter);
  state.round += 1;
  state.roundStarter = starter;
  for (const seat of SEATS) state.sides[seat].passed = false;
  events.push({ type: "roundStarted", round: state.round, starter });
  beginTurn(state, starter, events);
}

/** Sends every card on the battlefield to its Controller's Discard Pile; Weather to its owner's. */
function clearBattlefield(state: MatchState, events: MatchEvent[]): void {
  const discarded: CardRef[] = [];
  for (const seat of SEATS) {
    const side = state.sides[seat];
    for (const row of ROWS) {
      const rowState = side.rows[row];
      const leaving = [...rowState.units, ...(rowState.horn === null ? [] : [rowState.horn])];
      side.discard.push(...leaving);
      discarded.push(...leaving.map((uid) => ref(state, uid)));
      rowState.units = [];
      rowState.horn = null;
      rowState.leaderHorn = false;
    }
  }
  for (const uid of state.weather) {
    discardToOwner(state, uid);
    discarded.push(ref(state, uid));
  }
  state.weather = [];
  if (discarded.length > 0) events.push({ type: "cardsDiscarded", cards: discarded });
}

export function endMatch(state: MatchState, result: MatchResult, events: MatchEvent[]): void {
  state.phase = "ended";
  state.turn = null;
  state.result = result;
  events.push({ type: "matchEnded", result });
}
