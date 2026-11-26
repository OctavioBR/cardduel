import { ROWS, type RowId } from "./cards";
import type { CardRef, MatchEvent } from "./events";
import { leaderUsable } from "./leader";
import { discardToOwner, draw, ref, summonReplacement } from "./play";
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

  // (4) Kingdom draws a card for winning the Round.
  if (winner !== null && state.sides[winner].faction === "kingdom") {
    const before = state.sides[winner].hand.length;
    draw(state, winner, 1, events);
    if (state.sides[winner].hand.length > before) {
      events.push({ type: "factionPassive", seat: winner, faction: "kingdom", effect: "drewCard" });
    }
  }

  // The Round winner starts the next Round; after a Tie, the Seat that did not start does.
  const starter: Seat = winner ?? opponent(state.roundStarter);
  state.round += 1;
  state.roundStarter = starter;
  for (const seat of SEATS) state.sides[seat].passed = false;
  events.push({ type: "roundStarted", round: state.round, starter });
  if (state.round === VIKINGS_ROUND) {
    for (const seat of [starter, opponent(starter)]) {
      if (state.sides[seat].faction === "vikings") vikingsReturn(state, seat, events);
    }
  }
  beginTurn(state, starter, events);
}

/** The Round in which Vikings Puts Units from its Discard Pile. */
export const VIKINGS_ROUND = 3;
/** How many Units Vikings Puts. */
export const VIKINGS_RETURN_COUNT = 2;

/**
 * Vikings: picks, with the seeded generator, two Unit Cards (Heroes included) from the
 * Seat's Discard Pile and Puts each on its printed Row of the Seat's side.
 */
function vikingsReturn(state: MatchState, seat: Seat, events: MatchEvent[]): void {
  const side = state.sides[seat];
  const candidates = side.discard.filter((uid) => defOf(state, uid).kind === "unit");
  const chosen: Uid[] = [];
  while (chosen.length < VIKINGS_RETURN_COUNT && candidates.length > 0) {
    chosen.push(...candidates.splice(nextInt(state, candidates.length), 1));
  }
  if (chosen.length === 0) return;
  for (const uid of chosen) {
    const def = defOf(state, uid);
    if (def.kind !== "unit") continue;
    side.discard.splice(side.discard.indexOf(uid), 1);
    side.rows[def.row].units.push(uid);
  }
  events.push({
    type: "factionPassive",
    seat,
    faction: "vikings",
    effect: "putFromDiscard",
    cards: chosen.map((uid) => ref(state, uid)),
  });
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
  const summoners: Array<{ seat: Seat; row: RowId; uid: Uid }> = [];
  for (const seat of SEATS) {
    const side = state.sides[seat];
    for (const row of ROWS) {
      const rowState = side.rows[row];
      const units = rowState.units.filter((uid) => !keep.has(uid));
      const leaving = [...units, ...(rowState.horn === null ? [] : [rowState.horn])];
      side.discard.push(...leaving);
      discarded.push(...leaving.map((uid) => ref(state, uid)));
      summoners.push(...units.map((uid) => ({ seat, row, uid })));
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
  // Summon cards are replaced at once, so their Side Deck cards stay for the next Round.
  for (const { seat, row, uid } of summoners) summonReplacement(state, seat, row, uid, events);
}

export function endMatch(state: MatchState, result: MatchResult, events: MatchEvent[]): void {
  state.phase = "ended";
  state.turn = null;
  state.result = result;
  events.push({ type: "matchEnded", result });
}
