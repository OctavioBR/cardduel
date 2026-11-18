import { ROWS } from "./cards";
import type { CardRef, MatchEvent } from "./events";
import { leaderUsable } from "./leader";
import { discardToOwner, ref } from "./play";
import { nextInt } from "./rng";
import { type MatchResult, type MatchState, opponent, SEATS, type Seat, type Uid } from "./state";
import { computeStrengths, defOf, totalScore } from "./strength";

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
    events.push({ type: "passed", seat, reason: "nothingToDo" });
    afterTurn(state, seat, events);
  }
}

function endRound(state: MatchState, events: MatchEvent[]): void {
  const strengths = computeStrengths(state);
  const scores: [number, number] = [
    totalScore(state, 0, strengths),
    totalScore(state, 1, strengths),
  ];
  // (1) Compare Scores and remove Gems. Court wins a Tie unless both players are Court.
  let winner: Seat | null = null;
  if (scores[0] > scores[1]) winner = 0;
  else if (scores[1] > scores[0]) winner = 1;
  else {
    const court = SEATS.filter((seat) => state.sides[seat].faction === "court");
    if (court.length === 1) {
      winner = court[0] as Seat;
      events.push({ type: "factionPassive", seat: winner, faction: "court", effect: "wonTie" });
    }
  }

  for (const seat of SEATS) {
    if (winner !== seat) state.sides[seat].gems -= 1;
  }
  const gems: [number, number] = [state.sides[0].gems, state.sides[1].gems];
  events.push({ type: "roundEnded", round: state.round, scores, winner, gems });

  // (2) Swarm keeps one random non-Hero Unit it controls; (3) everything else is discarded.
  const kept = new Set<Uid>();
  for (const seat of SEATS) {
    if (state.sides[seat].faction !== "swarm") continue;
    const uid = swarmKeep(state, seat);
    if (uid === null) continue;
    kept.add(uid);
    events.push({
      type: "factionPassive",
      seat,
      faction: "swarm",
      effect: "keptUnit",
      card: ref(state, uid),
    });
  }
  clearBattlefield(state, events, kept);

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

/**
 * Picks, with the seeded generator, the non-Hero Unit Swarm keeps on the battlefield: one it
 * controls, so an opponent's Spy on its side qualifies. Null when there is none.
 */
function swarmKeep(state: MatchState, seat: Seat): Uid | null {
  const candidates = ROWS.flatMap((row) => state.sides[seat].rows[row].units).filter((uid) => {
    const def = defOf(state, uid);
    return def.kind === "unit" && !def.hero;
  });
  if (candidates.length === 0) return null;
  return candidates[nextInt(state, candidates.length)] as Uid;
}

/**
 * Sends every card on the battlefield to its Controller's Discard Pile (Weather to its
 * owner's), except `keep`: those stay where they are, Put into the next Round.
 */
function clearBattlefield(state: MatchState, events: MatchEvent[], keep: Set<Uid>): void {
  const discarded: CardRef[] = [];
  for (const seat of SEATS) {
    const side = state.sides[seat];
    for (const row of ROWS) {
      const rowState = side.rows[row];
      const leaving = [
        ...rowState.units.filter((uid) => !keep.has(uid)),
        ...(rowState.horn === null ? [] : [rowState.horn]),
      ];
      side.discard.push(...leaving);
      discarded.push(...leaving.map((uid) => ref(state, uid)));
      rowState.units = rowState.units.filter((uid) => keep.has(uid));
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
