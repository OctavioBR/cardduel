import { type Action, actionKey, type LoggedAction, type Rejection } from "./actions";
import { type CardDefinition, ROWS, type RowId } from "./cards";
import type { MatchEvent } from "./events";
import { legalActions } from "./legal";
import { resolveChoice, settlePending } from "./choice";
import { draw, resolvePlay, withStrengthEvents } from "./play";
import { nextInt, shuffle, toSeed } from "./rng";
import { afterTurn, beginTurn, endMatch } from "./round";
import {
  type MatchSetup,
  type MatchState,
  opponent,
  type RowState,
  SEATS,
  type Seat,
  type SideState,
} from "./state";

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
    pending: [],
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
  if (action.type === "forfeit") {
    events.push({ type: "forfeited", seat });
    endMatch(next, { outcome: "win", winner: opponent(seat), reason: "forfeit" }, events);
  } else {
    resolve(next, seat, action, events);
    // The Turn ends only once every Pending Choice it raised has been made.
    if (next.pending.length === 0) afterTurn(next, seat, events);
  }
  next.actionCount += 1;
  return { ok: true, state: next, events };
}

/**
 * The effect of a Turn action on the battlefield, without handing on the Turn or ending
 * the Round. Play Previews run exactly this.
 */
export function resolve(state: MatchState, seat: Seat, action: Action, events: MatchEvent[]): void {
  switch (action.type) {
    case "pass":
      state.sides[seat].passed = true;
      events.push({ type: "passed", seat, auto: false });
      return;
    case "play":
      withStrengthEvents(state, events, () => resolvePlay(state, seat, action, events));
      settlePending(state, events);
      return;
    case "choose": {
      // Choices raised while resolving this one are made before the rest of the queue.
      const rest = state.pending.slice(1);
      const current = state.pending[0];
      state.pending = [];
      if (current) {
        withStrengthEvents(state, events, () => resolveChoice(state, current, action, events));
      }
      state.pending = [...state.pending, ...rest];
      settlePending(state, events);
      return;
    }
    case "forfeit":
      return;
  }
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

function validate(state: MatchState, seat: Seat, action: Action): Rejection | null {
  if (state.phase === "ended") return reject("match_over", "The Match is over.");
  if (action.type === "forfeit") return null;
  if (state.turn !== seat) return reject("not_your_turn", "It is not your Turn.");
  const side = state.sides[seat];
  if (side.passed) return reject("already_passed", "You have Passed this Round.");
  const key = actionKey(action);
  if (legalActions(state, seat).some((legal) => actionKey(legal) === key)) return null;
  if (action.type === "play") {
    if (!side.hand.includes(action.card)) {
      return reject("card_not_in_hand", "That card is not in your hand.");
    }
    if (action.target !== undefined)
      return reject("invalid_target", "That card cannot target that.");
    return reject("invalid_row", "That card cannot be played there.");
  }
  return reject("invalid_action", "That action is not allowed now.");
}

function reject(code: Rejection["code"], message: string): Rejection {
  return { code, message };
}

function emptySide(setup: MatchSetup, seat: Seat): SideState {
  const deck = setup.decks[seat];
  const rows = {} as Record<RowId, RowState>;
  for (const row of ROWS) rows[row] = { units: [], horn: null, leaderHorn: false };
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
