import type { PlayAction } from "./actions";
import { ROWS, type RowId } from "./cards";
import type { CardRef, MatchEvent } from "./events";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
import { cardIdOf, computeStrengths, defOf } from "./strength";

export function ref(state: MatchState, uid: Uid): CardRef {
  return { uid, cardId: cardIdOf(state, uid) };
}

/** Draws up to `count` cards from the top of the deck; an emptier deck draws what is left. */
export function draw(state: MatchState, seat: Seat, count: number, events: MatchEvent[]): void {
  const side = state.sides[seat];
  const drawn = side.deck.splice(0, count);
  if (drawn.length === 0) return;
  side.hand.push(...drawn);
  events.push({
    type: "drew",
    seat,
    count: drawn.length,
    cards: drawn.map((uid) => ref(state, uid)),
  });
}

export function removeFromHand(state: MatchState, seat: Seat, uid: Uid): void {
  const hand = state.sides[seat].hand;
  hand.splice(hand.indexOf(uid), 1);
}

/** Resolves a legal play from the hand. Does not hand on the Turn. */
export function resolvePlay(
  state: MatchState,
  seat: Seat,
  action: PlayAction,
  events: MatchEvent[],
): void {
  const uid = action.card;
  const def = defOf(state, uid);
  removeFromHand(state, seat, uid);
  if (def.kind === "unit") {
    playUnit(state, seat, uid, action.row ?? def.row, events);
    return;
  }
  if (def.kind !== "special") return;
  switch (def.effect.type) {
    case "weather":
      state.weather.push(uid);
      events.push({ type: "cardPlayed", seat, card: ref(state, uid), zone: "weather" });
      return;
    case "clearWeather": {
      events.push({ type: "cardPlayed", seat, card: ref(state, uid), zone: "none" });
      const cleared = state.weather.map((w) => ref(state, w));
      for (const w of state.weather) discardToOwner(state, w);
      state.weather = [];
      events.push({ type: "weatherCleared", cards: cleared });
      state.sides[seat].discard.push(uid);
      return;
    }
    case "horn": {
      if (!action.row) throw new Error("Horn needs a Row");
      state.sides[seat].rows[action.row].horn = uid;
      events.push({
        type: "cardPlayed",
        seat,
        card: ref(state, uid),
        zone: action.row,
        side: seat,
      });
      return;
    }
    case "decoy": {
      if (action.target === undefined) throw new Error("Decoy needs a target");
      decoy(state, seat, uid, action.target, events);
      return;
    }
    default:
      throw new Error(`Special effect ${def.effect.type} is not implemented`);
  }
}

/**
 * Plays a Unit to a Row and fires its on-play abilities. A Spy goes to the opponent's
 * matching Row (they become its Controller) and its player draws 2.
 */
export function playUnit(
  state: MatchState,
  seat: Seat,
  uid: Uid,
  row: RowId,
  events: MatchEvent[],
): void {
  const def = defOf(state, uid);
  const spy = def.kind === "unit" && def.abilities.includes("spy");
  const side = spy ? opponent(seat) : seat;
  state.sides[side].rows[row].units.push(uid);
  events.push({ type: "cardPlayed", seat, card: ref(state, uid), zone: row, side });
  if (spy) draw(state, seat, 2, events);
}

/** The Decoy takes the target's place (Strength 0); the target returns to the hand. */
function decoy(state: MatchState, seat: Seat, uid: Uid, target: Uid, events: MatchEvent[]): void {
  for (const row of ROWS) {
    const units = state.sides[seat].rows[row].units;
    const index = units.indexOf(target);
    if (index < 0) continue;
    units[index] = uid;
    state.sides[seat].hand.push(target);
    events.push({ type: "cardPlayed", seat, card: ref(state, uid), zone: row, side: seat });
    events.push({ type: "returnedToHand", seat, card: ref(state, target) });
    return;
  }
  throw new Error(`Decoy target ${target} is not on Seat ${seat}'s side`);
}

/** Sends a card to the Discard Pile of the Seat whose Deck it came from (Weather, Horn). */
export function discardToOwner(state: MatchState, uid: Uid): void {
  const card = state.cards[uid];
  if (card) state.sides[card.owner].discard.push(uid);
}

/**
 * Runs `effect` and records a single `strengthChanged` event for every Unit that stayed on
 * the battlefield and whose current Strength changed.
 */
export function withStrengthEvents(
  state: MatchState,
  events: MatchEvent[],
  effect: () => void,
): void {
  const before = computeStrengths(state);
  effect();
  const after = computeStrengths(state);
  const changes = [];
  for (const [uid, to] of after) {
    const from = before.get(uid);
    if (from !== undefined && from !== to) changes.push({ uid, from, to });
  }
  if (changes.length > 0) events.push({ type: "strengthChanged", changes });
}
