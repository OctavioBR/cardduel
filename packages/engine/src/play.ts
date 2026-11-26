import type { PlayAction } from "./actions";
import { ROWS, type RowId } from "./cards";
import type { CardRef, MatchEvent, PlayedVia } from "./events";
import { nextInt, shuffle } from "./rng";
import { type MatchState, opponent, SEATS, type Seat, type Uid } from "./state";
import { cardIdOf, computeStrengths, defOf, passiveInPlay, rowScore } from "./strength";

export function ref(state: MatchState, uid: Uid): CardRef {
  const card: CardRef = { uid, cardId: cardIdOf(state, uid) };
  const artIndex = state.cards[uid]?.artIndex;
  if (artIndex !== undefined) card.artIndex = artIndex;
  return card;
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
      playSpecial(state, seat, uid, events);
  }
}

/**
 * Plays a Special Card that needs neither a Row nor a target: Weather, Clear Weather, Scorch
 * or Frenzy. `via` is set when it does not come from the hand (a Leader Plays it from the
 * deck).
 */
export function playSpecial(
  state: MatchState,
  seat: Seat,
  uid: Uid,
  events: MatchEvent[],
  via?: PlayedVia,
): void {
  const def = defOf(state, uid);
  if (def.kind !== "special") throw new Error(`Card ${def.id} is not a Special Card`);
  const played = (zone: "weather" | "none") =>
    events.push({ type: "cardPlayed", seat, card: ref(state, uid), zone, ...(via ? { via } : {}) });
  switch (def.effect.type) {
    case "weather":
      state.weather.push(uid);
      played("weather");
      return;
    case "clearWeather": {
      played("none");
      const cleared = state.weather.map((w) => ref(state, w));
      for (const w of state.weather) discardToOwner(state, w);
      state.weather = [];
      events.push({ type: "weatherCleared", cards: cleared });
      state.sides[seat].discard.push(uid);
      return;
    }
    case "scorch":
      played("none");
      scorchBattlefield(state, events);
      state.sides[seat].discard.push(uid);
      return;
    case "frenzy":
      played("none");
      frenzy(state, seat, events);
      state.sides[seat].discard.push(uid);
      return;
    case "horn":
    case "decoy":
      throw new Error(`${def.effect.type} needs a Row or target`);
  }
}

/**
 * Plays a Unit to a Row and fires its on-play abilities. A Spy goes to the opponent's
 * matching Row (they become its Controller) and its player draws 2. `via` says what Played
 * it; a card Played by Muster does not Muster again.
 */
export function playUnit(
  state: MatchState,
  seat: Seat,
  uid: Uid,
  row: RowId,
  events: MatchEvent[],
  via: PlayedVia = "hand",
): void {
  const def = defOf(state, uid);
  if (def.kind !== "unit") throw new Error(`Card ${def.id} is not a Unit`);
  const spy = def.abilities.includes("spy");
  const side = spy ? opponent(seat) : seat;
  state.sides[side].rows[row].units.push(uid);
  events.push({
    type: "cardPlayed",
    seat,
    card: ref(state, uid),
    zone: row,
    side,
    ...(via === "hand" ? {} : { via }),
  });
  if (spy) draw(state, seat, 2, events);
  if (def.abilities.includes("scorch")) scorchRow(state, opponent(seat), row, events);
  if (def.abilities.includes("battlefieldScorch")) scorchBattlefield(state, events);
  if (def.abilities.includes("frenzy")) frenzy(state, seat, events);
  if (def.abilities.includes("medic")) medic(state, seat, events);
  const group = def.musterCalls ?? def.musterGroup;
  if (def.abilities.includes("muster") && group && via !== "muster") {
    muster(state, seat, uid, group, events);
  }
}

/**
 * Takes a Side Deck card with this id out of the Seat's Side Deck (the lowest uid), or null
 * when none is left.
 */
function takeFromSideDeck(state: MatchState, seat: Seat, cardId: string): Uid | null {
  const sideDeck = state.sides[seat].sideDeck;
  const matches = sideDeck.filter((uid) => cardIdOf(state, uid) === cardId);
  if (matches.length === 0) return null;
  const uid = Math.min(...matches);
  sideDeck.splice(sideDeck.indexOf(uid), 1);
  return uid;
}

/**
 * Summon: a Summon card just discarded from `seat`'s Row (by Scorch or at Round end) is
 * replaced there at once by its Side Deck card, while its player has one left.
 */
export function summonReplacement(
  state: MatchState,
  seat: Seat,
  row: RowId,
  uid: Uid,
  events: MatchEvent[],
): void {
  const def = defOf(state, uid);
  if (def.kind !== "unit" || !def.abilities.includes("summon") || !def.summons) return;
  const owner = state.cards[uid]?.owner ?? seat;
  const replacement = takeFromSideDeck(state, owner, def.summons);
  if (replacement !== null) playUnit(state, seat, replacement, row, events, "summon");
}

/**
 * Frenzy: every Berserker on the Seat's side of the battlefield leaves for the Side Deck,
 * and its Side Deck form takes its place in the same spot.
 */
export function frenzy(state: MatchState, seat: Seat, events: MatchEvent[]): void {
  const side = state.sides[seat];
  const changes: Array<{ from: CardRef; to: CardRef }> = [];
  for (const row of ROWS) {
    const units = side.rows[row].units;
    for (const [i, uid] of units.entries()) {
      const def = defOf(state, uid);
      if (def.kind !== "unit" || !def.abilities.includes("berserker") || !def.transformsInto)
        continue;
      const form = takeFromSideDeck(state, seat, def.transformsInto);
      if (form === null) continue;
      units[i] = form;
      side.sideDeck.push(uid);
      changes.push({ from: ref(state, uid), to: ref(state, form) });
    }
  }
  if (changes.length > 0) events.push({ type: "transformed", seat, changes });
}

/**
 * Plays every other card of the Muster group from the Seat's hand and deck, then shuffles
 * the deck. Cards are taken in uid order, never deck order, so events reveal nothing about
 * where they sat in the deck.
 */
function muster(
  state: MatchState,
  seat: Seat,
  source: Uid,
  group: string,
  events: MatchEvent[],
): void {
  const side = state.sides[seat];
  const inGroup = (uid: Uid) => {
    const def = defOf(state, uid);
    return uid !== source && def.kind === "unit" && def.musterGroup === group;
  };
  const members = [...side.hand.filter(inGroup), ...side.deck.filter(inGroup)].sort(
    (x, y) => x - y,
  );
  if (members.length === 0) return;
  side.hand = side.hand.filter((uid) => !members.includes(uid));
  side.deck = side.deck.filter((uid) => !members.includes(uid));
  for (const uid of members) {
    const def = defOf(state, uid);
    if (def.kind === "unit") playUnit(state, seat, uid, def.row, events, "muster");
  }
  shuffle(state, side.deck);
}

/**
 * Medic: queues the Seat's choice of a non-Hero Unit from its Discard Pile, or, while a
 * Random Medic Leader is in the Match, Plays a random one to its printed Row at once.
 */
function medic(state: MatchState, seat: Seat, events: MatchEvent[]): void {
  const targets = medicTargets(state, seat);
  if (targets.length === 0) return;
  if (!passiveInPlay(state, "randomMedic")) {
    state.pending.push({ seat, kind: "medic" });
    return;
  }
  const uid = targets[nextInt(state, targets.length)] as Uid;
  const def = defOf(state, uid);
  if (def.kind !== "unit") return;
  const discard = state.sides[seat].discard;
  discard.splice(discard.indexOf(uid), 1);
  playUnit(state, seat, uid, def.row, events, "medic");
}

/** Non-Hero Units in the Seat's Discard Pile: what a Medic may Play. */
export function medicTargets(state: MatchState, seat: Seat): Uid[] {
  return state.sides[seat].discard.filter((uid) => {
    const def = defOf(state, uid);
    return def.kind === "unit" && !def.hero;
  });
}

/** Minimum current Score of a Row for a Row Scorch (Unit or Leader) to fire. */
export const ROW_SCORCH_THRESHOLD = 10;

/**
 * Row Scorch: if the Seat's Row has a current Score of 10 or more, destroys its highest
 * current-Strength non-Hero Unit or Units.
 */
export function scorchRow(state: MatchState, seat: Seat, row: RowId, events: MatchEvent[]): void {
  const strengths = computeStrengths(state);
  if (rowScore(state, seat, row, strengths) < ROW_SCORCH_THRESHOLD) return;
  destroyStrongest(state, strengths, [{ seat, row }], events);
}

/**
 * Special Scorch: destroys every non-Hero Unit with the highest current Strength on the
 * whole battlefield, on both sides, all ties included.
 */
export function scorchBattlefield(state: MatchState, events: MatchEvent[]): void {
  const rows = SEATS.flatMap((seat) => ROWS.map((row) => ({ seat, row })));
  destroyStrongest(state, computeStrengths(state), rows, events);
}

function destroyStrongest(
  state: MatchState,
  strengths: Map<Uid, number>,
  rows: Array<{ seat: Seat; row: RowId }>,
  events: MatchEvent[],
): void {
  const candidates: Array<{ seat: Seat; row: RowId; uid: Uid; strength: number }> = [];
  for (const { seat, row } of rows) {
    for (const uid of state.sides[seat].rows[row].units) {
      const def = defOf(state, uid);
      if (def.kind !== "unit" || def.hero) continue;
      candidates.push({ seat, row, uid, strength: strengths.get(uid) ?? 0 });
    }
  }
  if (candidates.length === 0) return;
  const highest = Math.max(...candidates.map((c) => c.strength));
  const doomed = candidates.filter((c) => c.strength === highest);
  for (const { seat, row, uid } of doomed) {
    const units = state.sides[seat].rows[row].units;
    units.splice(units.indexOf(uid), 1);
    state.sides[seat].discard.push(uid);
  }
  events.push({ type: "destroyed", cards: doomed.map(({ uid }) => ref(state, uid)) });
  for (const { seat, row, uid } of doomed) summonReplacement(state, seat, row, uid, events);
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
