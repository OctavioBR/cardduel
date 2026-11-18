import { type Action, actionKey, type LoggedAction, type Rejection } from "./actions";
import { type CardDefinition, ROWS, type RowId } from "./cards";
import { resolveChoice, settlePending } from "./choice";
import type { MatchEvent, PassReason } from "./events";
import { useLeader } from "./leader";
import { legalActions, MAX_REDRAW } from "./legal";
import { draw, ref, resolvePlay, withStrengthEvents } from "./play";
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
import copy from "./strings/en.json";

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
    phase: "redraw",
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
  // Both Seats now Redraw privately; the first Turn starts when both have confirmed.
  return { state, events };
}

export interface ApplyOptions {
  /**
   * The Room is acting for the Seat because its Turn Timer ran out (ADR-0009). The state
   * is the same either way; only the Pass event says why.
   */
  timedOut?: boolean;
}

/** Applies one action for a Seat. Rejections leave the state untouched. */
export function applyAction(
  state: MatchState,
  seat: Seat,
  action: Action,
  options: ApplyOptions = {},
): ApplyResult {
  const rejection = validate(state, seat, action);
  if (rejection) return { ok: false, rejection };

  const next = cloneState(state);
  const events: MatchEvent[] = [];
  if (action.type === "forfeit") {
    events.push({ type: "forfeited", seat });
    endMatch(next, { outcome: "win", winner: opponent(seat), reason: "forfeit" }, events);
  } else if (action.type === "redraw" || action.type === "confirmRedraw") {
    applyRedraw(next, seat, action, events);
  } else {
    resolve(next, seat, action, events, options.timedOut ? "turnTimer" : "player");
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
export function resolve(
  state: MatchState,
  seat: Seat,
  action: Action,
  events: MatchEvent[],
  passReason: Exclude<PassReason, "nothingToDo"> = "player",
): void {
  switch (action.type) {
    case "pass":
      state.sides[seat].passed = true;
      events.push({ type: "passed", seat, reason: passReason });
      return;
    case "play":
      withStrengthEvents(state, events, () => resolvePlay(state, seat, action, events));
      settlePending(state, events);
      return;
    case "leader":
      withStrengthEvents(state, events, () => useLeader(state, seat, action, events));
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
    default:
      return;
  }
}

function applyRedraw(
  state: MatchState,
  seat: Seat,
  action: Extract<Action, { type: "redraw" | "confirmRedraw" }>,
  events: MatchEvent[],
): void {
  const side = state.sides[seat];
  if (action.type === "redraw") {
    side.hand.splice(side.hand.indexOf(action.card), 1);
    side.deck.push(action.card);
    shuffle(state, side.deck);
    side.redraw.returned += 1;
    events.push({ type: "cardReturned", seat, card: ref(state, action.card) });
    draw(state, seat, 1, events);
  }
  if (action.type === "confirmRedraw" || side.redraw.returned >= MAX_REDRAW) {
    side.redraw.done = true;
    events.push({ type: "redrawDone", seat, returned: side.redraw.returned });
  }
  if (state.sides[0].redraw.done && state.sides[1].redraw.done) {
    state.phase = "turns";
    events.push({ type: "roundStarted", round: 1, starter: state.roundStarter });
    beginTurn(state, state.roundStarter, events);
  }
}

/**
 * Rebuilds a Match from its seed and action log (ADR-0003). Throws on a rejected action.
 * Turn Timer expiries replay like any other action (ADR-0009).
 */
export function replay(setup: MatchSetup, log: readonly LoggedAction[]): MatchState {
  let { state } = createMatch(setup);
  for (const [i, entry] of log.entries()) {
    const result = applyAction(state, entry.seat, entry.action);
    if (!result.ok) throw new Error(`Action ${i} rejected: ${result.rejection.message}`);
    state = result.state;
  }
  return state;
}

/**
 * Copies everything a Turn can change. Card definitions and card instances never change
 * during a Match, so they are shared; this keeps Play Previews cheap.
 */
export function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    sides: [cloneSide(state.sides[0]), cloneSide(state.sides[1])],
    weather: [...state.weather],
    pending: state.pending.map((p) => ({ ...p })),
    result: state.result ? { ...state.result } : null,
  };
}

function cloneSide(side: SideState): SideState {
  return {
    ...side,
    deck: [...side.deck],
    hand: [...side.hand],
    discard: [...side.discard],
    known: [...side.known],
    redraw: { ...side.redraw },
    rows: {
      close: cloneRow(side.rows.close),
      ranged: cloneRow(side.rows.ranged),
      siege: cloneRow(side.rows.siege),
    },
  };
}

function cloneRow(row: RowState): RowState {
  return { ...row, units: [...row.units] };
}

function validate(state: MatchState, seat: Seat, action: Action): Rejection | null {
  if (state.phase === "ended") return reject("match_over", copy.theMatchIsOver);
  if (action.type === "forfeit") return null;
  if (state.phase === "redraw") {
    const key = actionKey(action);
    if (legalActions(state, seat).some((legal) => actionKey(legal) === key)) return null;
    return reject("invalid_action", copy.finishYourRedrawFirst);
  }
  if (state.turn !== seat) return reject("not_your_turn", copy.itIsNotYourTurn);
  const side = state.sides[seat];
  if (side.passed) return reject("already_passed", copy.youHavePassedThisRound);
  const key = actionKey(action);
  if (legalActions(state, seat).some((legal) => actionKey(legal) === key)) return null;
  if (action.type === "play") {
    if (!side.hand.includes(action.card)) {
      return reject("card_not_in_hand", copy.thatCardIsNotInYour);
    }
    if (action.target !== undefined) return reject("invalid_target", copy.thatCardCannotTargetThat);
    return reject("invalid_row", copy.thatCardCannotBePlayedThere);
  }
  return reject("invalid_action", copy.thatActionIsNotAllowedNow);
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
    known: [],
    redraw: { returned: 0, done: false },
  };
}
