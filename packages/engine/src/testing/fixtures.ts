import { expect } from "vitest";
import type { Action } from "../actions";
import type { CardDefinition, RowId, SpecialEffect, UnitAbility } from "../cards";
import type { MatchEvent } from "../events";
import { applyAction, createMatch } from "../match";
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

export function special(id: string, effect: SpecialEffect): CardDefinition {
  return { id, kind: "special", faction: "neutral", maxCopies: 3, effect };
}

/**
 * Test-only: moves a card with this id from the Seat's hand or deck straight onto a Row
 * (or the Weather zone / Horn slot), bypassing the rules, to build boards quickly.
 */
export function place(
  state: MatchState,
  seat: Seat,
  cardId: string,
  where: RowId | "weather" | { horn: RowId },
): Uid {
  const side = state.sides[seat];
  for (const pile of [side.hand, side.deck]) {
    const i = pile.findIndex((u) => state.cards[u]?.cardId === cardId);
    if (i < 0) continue;
    const [uid] = pile.splice(i, 1) as [Uid];
    if (where === "weather") state.weather.push(uid);
    else if (typeof where === "object") side.rows[where.horn].horn = uid;
    else side.rows[where].units.push(uid);
    return uid;
  }
  return expect.fail(`Seat ${seat} has no ${cardId} left to place`);
}

/** Test-only: a card with this id in the Seat's hand, moved there from the deck if needed. */
export function toHand(state: MatchState, seat: Seat, cardId: string): Uid {
  const side = state.sides[seat];
  const held = side.hand.find((u) => state.cards[u]?.cardId === cardId);
  if (held !== undefined) return held;
  const i = side.deck.findIndex((u) => state.cards[u]?.cardId === cardId);
  if (i < 0) return expect.fail(`Seat ${seat} has no ${cardId} in hand or deck`);
  const [uid] = side.deck.splice(i, 1) as [Uid];
  side.hand.push(uid);
  return uid;
}

/** Creates a Match and confirms both Redraws without returning cards. */
export function startMatch(s: MatchSetup): { state: MatchState; events: MatchEvent[] } {
  const created = createMatch(s);
  let state = created.state;
  const events = [...created.events];
  for (const seat of [0, 1] as const) {
    const result = act(state, seat, { type: "confirmRedraw" });
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
