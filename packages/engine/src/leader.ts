import type { Action, LeaderAction } from "./actions";
import { type CardId, type LeaderAbility, ROWS } from "./cards";
import type { MatchEvent } from "./events";
import { hornSlotEmpty } from "./legal";
import { discardToOwner, ref, scorchRow } from "./play";
import { nextInt } from "./rng";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
import { defOf } from "./strength";

/** How many cards a "look at the opponent's hand" Leader reveals. */
export const LOOK_COUNT = 3;

export function leaderAbility(state: MatchState, seat: Seat): LeaderAbility | null {
  const def = state.defs[state.sides[seat].leader];
  return def?.kind === "leader" ? def.ability : null;
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
      return ROWS.filter((row) => hornSlotEmpty(state, seat, row)).map((row) => ({
        type: "leader",
        row,
      }));
    case "playWeatherFromDeck":
      return weatherInDeck(state, seat).length > 0 ? [{ type: "leader" }] : [];
    case "returnFromDiscard":
      return side.discard.length > 0 ? [{ type: "leader" }] : [];
    case "drawChosenFromDeck":
      return side.deck.length > 0 ? [{ type: "leader" }] : [];
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
