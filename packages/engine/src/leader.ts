import type { Action, LeaderAction } from "./actions";
import { type CardId, type LeaderAbility, ROWS, type RowId } from "./cards";
import type { MatchEvent } from "./events";
import { hornSlotEmpty } from "./legal";
import { discardToOwner, draw, playSpecial, ref, scorchRow } from "./play";
import { nextInt, shuffle } from "./rng";
import { type MatchState, opponent, SEATS, type Seat, type Uid } from "./state";
import { computeStrengths, defOf, leaderAbilityOf } from "./strength";

/** How many cards a "look at the opponent's hand" Leader reveals. */
export const LOOK_COUNT = 3;

/** How many cards a Discard-to-Draw Leader discards from the hand. */
export const LEADER_DISCARD_COUNT = 2;

/** The Seat's Leader ability, or null when it has none or the opponent's Leader cancels it. */
export function leaderAbility(state: MatchState, seat: Seat): LeaderAbility | null {
  return leaderAbilityOf(state, seat);
}

/**
 * Whether the Seat could use its active Leader ability now: once per Match, not after
 * Passing, and only when it would have something to act on.
 */
export function leaderUsable(state: MatchState, seat: Seat): boolean {
  return leaderActions(state, seat).length > 0;
}

/** The legal Leader actions for the Seat (one per Row for the Horn kind). */
export function leaderActions(state: MatchState, seat: Seat): LeaderAction[] {
  const side = state.sides[seat];
  const ability = leaderAbility(state, seat);
  if (!ability || side.leaderUsed || side.passed || state.phase !== "turns") return [];
  switch (ability.type) {
    case "passive":
      return [];
    case "hornRow":
      return (ability.row ? [ability.row] : ROWS)
        .filter((row) => hornSlotEmpty(state, seat, row))
        .map((row) => ({ type: "leader", row }));
    case "playWeatherFromDeck":
      return weatherInDeck(state, seat).length > 0 ? [{ type: "leader" }] : [];
    case "playCardFromDeck":
      return side.deck.some((uid) => defOf(state, uid).id === ability.card)
        ? [{ type: "leader" }]
        : [];
    case "playBondCopyFromDeck":
      return bondCopies(state, seat).length > 0 ? [{ type: "leader" }] : [];
    case "shuffleDiscardsIntoDecks":
      return SEATS.some((s) => state.sides[s].discard.length > 0) ? [{ type: "leader" }] : [];
    case "moveAgileUnits":
      return agileMoves(state, seat, false).length > 0 ? [{ type: "leader" }] : [];
    case "drawFromDeck":
      return side.deck.length > 0 ? [{ type: "leader" }] : [];
    case "returnFromDiscard":
      return side.discard.length > 0 ? [{ type: "leader" }] : [];
    case "drawChosenFromDeck":
      return side.deck.length > 0 ? [{ type: "leader" }] : [];
    case "discardToDrawChosen":
      return side.hand.length >= LEADER_DISCARD_COUNT && side.deck.length > 0
        ? [{ type: "leader" }]
        : [];
    case "takeFromOpponentDiscard":
      return takeableFromOpponent(state, seat).length > 0 ? [{ type: "leader" }] : [];
    case "lookAtOpponentHand":
      return state.sides[opponent(seat)].hand.length > 0 ? [{ type: "leader" }] : [];
    case "clearWeather":
    case "scorchRow":
      return [{ type: "leader" }];
  }
}

/** Uses the Leader ability. Takes the Turn; choice kinds queue a Pending Choice. */
export function useLeader(
  state: MatchState,
  seat: Seat,
  action: LeaderAction,
  events: MatchEvent[],
): void {
  const ability = leaderAbility(state, seat);
  if (!ability) throw new Error("No Leader");
  const side = state.sides[seat];
  side.leaderUsed = true;
  events.push({
    type: "leaderUsed",
    seat,
    ability: ability.type,
    ...(action.row ? { row: action.row } : {}),
  });
  switch (ability.type) {
    case "playWeatherFromDeck":
      state.pending.push({ seat, kind: "leaderWeather" });
      return;
    case "returnFromDiscard":
      state.pending.push({ seat, kind: "leaderReturn" });
      return;
    case "drawChosenFromDeck":
      state.pending.push({ seat, kind: "leaderDraw" });
      return;
    case "discardToDrawChosen":
      for (let i = 0; i < LEADER_DISCARD_COUNT; i++) {
        state.pending.push({ seat, kind: "leaderDiscard" });
      }
      state.pending.push({ seat, kind: "leaderDraw" });
      return;
    case "takeFromOpponentDiscard":
      state.pending.push({ seat, kind: "leaderTake" });
      return;
    case "playBondCopyFromDeck":
      state.pending.push({ seat, kind: "leaderBond" });
      return;
    case "playCardFromDeck":
      playSpecial(state, seat, takeFromDeck(state, seat, ability.card), events, "leader");
      return;
    case "shuffleDiscardsIntoDecks":
      shuffleDiscardsIntoDecks(state, events);
      return;
    case "moveAgileUnits": {
      const moves = agileMoves(state, seat, true);
      events.push({
        type: "unitsMoved",
        seat,
        moves: moves.map(({ uid, from, to }) => ({ card: ref(state, uid), from, to })),
      });
      return;
    }
    case "drawFromDeck":
      draw(state, seat, 1, events);
      return;
    case "clearWeather": {
      const cleared = state.weather.map((uid) => ref(state, uid));
      for (const uid of state.weather) discardToOwner(state, uid);
      state.weather = [];
      events.push({ type: "weatherCleared", cards: cleared });
      return;
    }
    case "hornRow":
      if (!action.row) throw new Error("Leader Horn needs a Row");
      side.rows[action.row].leaderHorn = true;
      return;
    case "scorchRow":
      scorchRow(state, opponent(seat), ability.row, events);
      return;
    case "lookAtOpponentHand": {
      const hand = [...state.sides[opponent(seat)].hand];
      const seen: Uid[] = [];
      while (seen.length < LOOK_COUNT && hand.length > 0) {
        seen.push(...hand.splice(nextInt(state, hand.length), 1));
      }
      side.known = [...new Set([...side.known, ...seen])];
      events.push({ type: "handRevealed", seat, cards: seen.map((uid) => ref(state, uid)) });
      return;
    }
    case "passive":
      throw new Error("A passive Leader has no active ability");
  }
}

/**
 * Each Seat's Discard Pile goes back into its deck, which is then shuffled. Side Deck cards
 * go back to the Side Deck instead.
 */
function shuffleDiscardsIntoDecks(state: MatchState, events: MatchEvent[]): void {
  const counts: [number, number] = [0, 0];
  for (const seat of SEATS) {
    const side = state.sides[seat];
    for (const uid of side.discard) {
      const def = defOf(state, uid);
      (def.kind === "unit" && def.sideDeck ? side.sideDeck : side.deck).push(uid);
    }
    counts[seat] = side.discard.length;
    side.discard = [];
    shuffle(state, side.deck);
  }
  events.push({ type: "discardsShuffled", counts });
}

/**
 * What a "copy of a Tight Bond Unit" Leader may Play: each Tight Bond card id on the Seat's
 * side of the battlefield that also has a copy in its deck, with the Rows where it stands.
 */
export function bondCopies(state: MatchState, seat: Seat): Array<{ cardId: CardId; row: RowId }> {
  const side = state.sides[seat];
  const inDeck = new Set(side.deck.map((uid) => defOf(state, uid).id));
  const options = new Map<string, { cardId: CardId; row: RowId }>();
  for (const row of ROWS) {
    for (const uid of side.rows[row].units) {
      const def = defOf(state, uid);
      if (def.kind !== "unit" || !def.abilities.includes("tightBond") || !inDeck.has(def.id))
        continue;
      options.set(`${def.id}:${row}`, { cardId: def.id, row });
    }
  }
  return [...options.values()];
}

/**
 * Moves each non-Hero Agile Unit on the Seat's side, in uid order, to its other Row (Close or
 * Ranged) when its current Strength there would be higher. With `apply` false the battlefield
 * is restored afterwards, so this only says which moves would happen.
 */
export function agileMoves(
  state: MatchState,
  seat: Seat,
  apply: boolean,
): Array<{ uid: Uid; from: RowId; to: RowId }> {
  const rows = state.sides[seat].rows;
  const saved = { close: [...rows.close.units], ranged: [...rows.ranged.units] };
  const agile = [...rows.close.units, ...rows.ranged.units]
    .filter((uid) => {
      const def = defOf(state, uid);
      return def.kind === "unit" && !def.hero && def.abilities.includes("agile");
    })
    .sort((x, y) => x - y);
  const moves: Array<{ uid: Uid; from: RowId; to: RowId }> = [];
  for (const uid of agile) {
    const from: RowId = rows.close.units.includes(uid) ? "close" : "ranged";
    const to: RowId = from === "close" ? "ranged" : "close";
    const before = computeStrengths(state).get(uid) ?? 0;
    rows[from].units.splice(rows[from].units.indexOf(uid), 1);
    rows[to].units.push(uid);
    if ((computeStrengths(state).get(uid) ?? 0) > before) {
      moves.push({ uid, from, to });
    } else {
      rows[to].units.pop();
      rows[from].units.push(uid);
    }
  }
  if (!apply) {
    rows.close.units = saved.close;
    rows.ranged.units = saved.ranged;
  }
  return moves;
}

/** Non-Hero cards in the opponent's Discard Pile: what a Take-from-Discard Leader may take. */
export function takeableFromOpponent(state: MatchState, seat: Seat): Uid[] {
  return state.sides[opponent(seat)].discard.filter((uid) => {
    const def = defOf(state, uid);
    return !(def.kind === "unit" && def.hero);
  });
}

/** Distinct Weather card ids in the Seat's deck. */
export function weatherInDeck(state: MatchState, seat: Seat): CardId[] {
  return distinctIds(state, state.sides[seat].deck, (uid) => {
    const def = defOf(state, uid);
    return def.kind === "special" && def.effect.type === "weather";
  });
}

/** Distinct card ids in a pile, sorted, optionally filtered. */
export function distinctIds(
  state: MatchState,
  uids: Uid[],
  keep: (uid: Uid) => boolean = () => true,
): CardId[] {
  return [...new Set(uids.filter(keep).map((uid) => defOf(state, uid).id))].sort();
}

/**
 * Takes a card with this id out of the Seat's deck: the lowest uid, so which copy was
 * taken says nothing about deck order.
 */
export function takeFromDeck(state: MatchState, seat: Seat, cardId: CardId): Uid {
  const deck = state.sides[seat].deck;
  const matches = deck.filter((uid) => defOf(state, uid).id === cardId);
  if (matches.length === 0) throw new Error(`No ${cardId} in Seat ${seat}'s deck`);
  const uid = Math.min(...matches);
  deck.splice(deck.indexOf(uid), 1);
  return uid;
}

export type { Action };
