import { expect } from "vitest";
import type { Action } from "../actions";
import type { CardDefinition, RowId, UnitAbility } from "../cards";
import type { MatchEvent } from "../events";
import { applyAction } from "../match";
import type { DeckSpec, MatchSetup, MatchState, Seat, Uid } from "../state";

/** Fixture cards for engine tests. Never the real catalog. */
export function unit(
  id: string,
  strength: number,
  row: RowId = "close",
  extra: Partial<{
    hero: boolean;
    abilities: UnitAbility[];
    musterGroup: string;
    faction: CardDefinition["faction"];
  }> = {},
): CardDefinition {
  return {
    id,
    kind: "unit",
    faction: extra.faction ?? "neutral",
    strength,
    row,
    hero: extra.hero ?? false,
    abilities: extra.abilities ?? [],
    maxCopies: 3,
    ...(extra.musterGroup ? { musterGroup: extra.musterGroup } : {}),
  };
}

export const PLAIN_LEADER: CardDefinition = {
  id: "leader-plain",
  kind: "leader",
  faction: "swarm",
  maxCopies: 1,
  ability: { type: "clearWeather" },
};

export function deck(cards: string[], faction: DeckSpec["faction"] = "swarm"): DeckSpec {
  return { faction, leader: PLAIN_LEADER.id, cards };
}

export function repeat(id: string, n: number): string[] {
  return Array.from({ length: n }, () => id);
}

export function setup(
  seed: number,
  decks: [DeckSpec, DeckSpec],
  cards: CardDefinition[],
): MatchSetup {
  return { seed, decks, cards: [PLAIN_LEADER, ...cards] };
}

/** Applies an action that must be accepted. */
export function act(
  state: MatchState,
  seat: Seat,
  action: Action,
): { state: MatchState; events: MatchEvent[] } {
  const result = applyAction(state, seat, action);
  if (!result.ok) {
    expect.fail(
      `Expected ${JSON.stringify(action)} by Seat ${seat} to be accepted: ${result.rejection.message}`,
    );
  }
  return { state: result.state, events: result.events };
}

/** First card in the Seat's hand with the given id (or any card). */
export function inHand(state: MatchState, seat: Seat, cardId?: string): Uid {
  const uid = state.sides[seat].hand.find(
    (u) => cardId === undefined || state.cards[u]?.cardId === cardId,
  );
  if (uid === undefined) expect.fail(`Seat ${seat} has no ${cardId ?? "card"} in hand`);
  return uid;
}

/** The printed Row of a Unit (Close for anything else). */
export function ownRow(state: MatchState, uid: Uid): RowId {
  const def = state.defs[state.cards[uid]?.cardId ?? ""];
  return def?.kind === "unit" ? def.row : "close";
}

/** Plays the first matching hand card to its own Row. */
export function playCard(state: MatchState, seat: Seat, cardId?: string, row?: RowId) {
  const uid = inHand(state, seat, cardId);
  return act(state, seat, { type: "play", card: uid, row: row ?? ownRow(state, uid) });
}
