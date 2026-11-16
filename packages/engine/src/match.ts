import type { Action, LoggedAction, Rejection } from "./actions";
import { type CardDefinition, ROWS, type RowId, type UnitDefinition } from "./cards";
import type { CardRef, MatchEvent } from "./events";
import { nextInt, shuffle, toSeed } from "./rng";
import {
  type MatchSetup,
  type MatchState,
  opponent,
  type RowState,
  SEATS,
  type Seat,
  type SideState,
  type Uid,
} from "./state";
import { cardIdOf, computeStrengths, totalScore } from "./strength";

export const HAND_SIZE = 10;
export const STARTING_GEMS = 2;

export type ApplyResult =
  | { ok: true; state: MatchState; events: MatchEvent[] }
  | { ok: false; rejection: Rejection };

/** Creates a Match from a seed and two Decks: coin flip, shuffle, deal. */
export function createMatch(setup: MatchSetup): { state: MatchState; events: MatchEvent[] } {
  const defs: Record<string, CardDefinition> = {};
  for (const def of setup.cards) defs[def.id] = def;

  const state: MatchState = {
    version: 1,
    rng: toSeed(setup.seed),
    defs,
    cards: [],
    sides: [emptySide(setup, 0), emptySide(setup, 1)],
    weather: [],
    phase: "turns",
    round: 1,
    roundStarter: 0,
    turn: null,
    actionCount: 0,
    result: null,
  };

  for (const seat of SEATS) {
    const deck = setup.decks[seat];
    for (const cardId of [deck.leader, ...deck.cards]) {
      if (!defs[cardId]) throw new Error(`No definition for card ${cardId}`);
    }
    // Uids follow Deck-list order, before the shuffle, so a uid never hints at deck order.
    for (const cardId of deck.cards) {
      state.sides[seat].deck.push(state.cards.length);
      state.cards.push({ cardId, owner: seat });
    }
  }

  const events: MatchEvent[] = [];
  const starter: Seat = nextInt(state, 2) === 0 ? 0 : 1;
  state.roundStarter = starter;
  events.push({ type: "coinFlip", starter });

  for (const seat of SEATS) {
    shuffle(state, state.sides[seat].deck);
    draw(state, seat, HAND_SIZE, events);
  }

  events.push({ type: "roundStarted", round: 1, starter });
  beginTurn(state, starter, events);
  return { state, events };
}

/** Applies one action for a Seat. Rejections leave the state untouched. */
export function applyAction(state: MatchState, seat: Seat, action: Action): ApplyResult {
  const rejection = validate(state, seat, action);
  if (rejection) return { ok: false, rejection };

  const next = cloneState(state);
  const events: MatchEvent[] = [];
  switch (action.type) {
    case "forfeit":
      events.push({ type: "forfeited", seat });
      endMatch(next, { outcome: "win", winner: opponent(seat), reason: "forfeit" }, events);
      break;
    case "pass":
      next.sides[seat].passed = true;
      events.push({ type: "passed", seat, auto: false });
      afterTurn(next, seat, events);
      break;
    case "play":
      playUnitFromHand(next, seat, action.card, action.row, events);
      afterTurn(next, seat, events);
      break;
  }
  next.actionCount += 1;
  return { ok: true, state: next, events };
}

/** Rebuilds a Match from its seed and action log (ADR-0003). Throws on a rejected action. */
export function replay(setup: MatchSetup, log: readonly LoggedAction[]): MatchState {
  let { state } = createMatch(setup);
  for (const [i, entry] of log.entries()) {
    const result = applyAction(state, entry.seat, entry.action);
    if (!result.ok) throw new Error(`Action ${i} rejected: ${result.rejection.message}`);
    state = result.state;
  }
  return state;
}

export function cloneState(state: MatchState): MatchState {
  return JSON.parse(JSON.stringify(state)) as MatchState;
}

/** Rows a Unit may be played to from the hand. */
export function playableRows(def: UnitDefinition): RowId[] {
  return def.abilities.includes("agile") ? ["close", "ranged"] : [def.row];
}

/** Whether the Seat could still use an active Leader ability. Wired up with Leader abilities. */
export function leaderUsable(_state: MatchState, _seat: Seat): boolean {
  return false;
}

function validate(state: MatchState, seat: Seat, action: Action): Rejection | null {
  if (state.phase === "ended") return reject("match_over", "The Match is over.");
  if (action.type === "forfeit") return null;
  if (state.turn !== seat) return reject("not_your_turn", "It is not your Turn.");
  const side = state.sides[seat];
  if (side.passed) return reject("already_passed", "You have Passed this Round.");
  switch (action.type) {
    case "pass":
      return null;
    case "play": {
      if (!side.hand.includes(action.card)) {
        return reject("card_not_in_hand", "That card is not in your hand.");
      }
      const def = state.defs[cardIdOf(state, action.card)];
      if (def?.kind !== "unit") return reject("invalid_action", "That card cannot be played.");
      if (!playableRows(def).includes(action.row)) {
        return reject("invalid_row", "That card cannot be played to that Row.");
      }
      return null;
    }
    default:
      return reject("invalid_action", "Unknown action.");
  }
}

function reject(code: Rejection["code"], message: string): Rejection {
  return { code, message };
}

function emptySide(setup: MatchSetup, seat: Seat): SideState {
  const deck = setup.decks[seat];
  const rows = {} as Record<RowId, RowState>;
  for (const row of ROWS) rows[row] = { units: [], horn: null };
  return {
    faction: deck.faction,
    leader: deck.leader,
    leaderUsed: false,
    deck: [],
    hand: [],
    discard: [],
    rows,
    gems: STARTING_GEMS,
    passed: false,
  };
}

export function ref(state: MatchState, uid: Uid): CardRef {
  return { uid, cardId: cardIdOf(state, uid) };
}

/** Draws up to `count` cards from the top of the deck; an emptier deck draws what is left. */
export function draw(state: MatchState, seat: Seat, count: number, events: MatchEvent[]): void {
  const side = state.sides[seat];
  const drawn = side.deck.splice(0, count);
  if (drawn.length === 0) return;
  side.hand.push(...drawn);
  events.push({ type: "drew", seat, cards: drawn.map((uid) => ref(state, uid)) });
}

export function removeFromHand(state: MatchState, seat: Seat, uid: Uid): void {
  const hand = state.sides[seat].hand;
  hand.splice(hand.indexOf(uid), 1);
}

function playUnitFromHand(
  state: MatchState,
  seat: Seat,
  uid: Uid,
  row: RowId,
  events: MatchEvent[],
): void {
  removeFromHand(state, seat, uid);
  state.sides[seat].rows[row].units.push(uid);
  events.push({ type: "cardPlayed", seat, card: ref(state, uid), row });
}

/** Hands the Turn on after `actor` has acted, ending the Round when both have Passed. */
function afterTurn(state: MatchState, actor: Seat, events: MatchEvent[]): void {
  if (state.phase === "ended") return;
  const other = opponent(actor);
  if (state.sides[actor].passed && state.sides[other].passed) {
    endRound(state, events);
    return;
  }
  beginTurn(state, state.sides[other].passed ? actor : other, events);
}

/** Gives `seat` the Turn, Passing it automatically when it has nothing it could do. */
function beginTurn(state: MatchState, seat: Seat, events: MatchEvent[]): void {
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

/** Sends every card on the battlefield to its Controller's Discard Pile. */
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
    }
  }
  for (const uid of state.weather) {
    const card = state.cards[uid];
    if (card) state.sides[card.owner].discard.push(uid);
    discarded.push(ref(state, uid));
  }
  state.weather = [];
  if (discarded.length > 0) events.push({ type: "cardsDiscarded", cards: discarded });
}

function endMatch(
  state: MatchState,
  result: NonNullable<MatchState["result"]>,
  events: MatchEvent[],
): void {
  state.phase = "ended";
  state.turn = null;
  state.result = result;
  events.push({ type: "matchEnded", result });
}
