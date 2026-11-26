import { describe, expect, it } from "vitest";
import type { CardDefinition, LeaderAbility } from "./cards";
import { legalActions } from "./legal";
import { applyAction } from "./match";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
import { computeStrengths } from "./strength";
import {
  act,
  deck,
  place,
  repeat,
  setup,
  special,
  startMatch,
  toHand,
  unit,
} from "./testing/fixtures";
import { filterEvents, viewFor } from "./view";

const CARDS = [
  unit("knight", 6, "close"),
  unit("archer", 4, "ranged"),
  unit("hero", 10, "close", { hero: true }),
  special("frost", { type: "weather", rows: ["close"] }),
  special("fog", { type: "weather", rows: ["ranged"] }),
];
const LIST = [...repeat("knight", 8), ...repeat("archer", 8), "hero", "frost", "fog"];

function leader(ability: LeaderAbility): CardDefinition {
  return { id: `leader-${ability.type}`, kind: "leader", faction: "court", maxCopies: 1, ability };
}

function board(ability: LeaderAbility): { state: MatchState; a: Seat; b: Seat } {
  const lead = leader(ability);
  const deckA = { ...deck(LIST, "court"), leader: lead.id };
  const { state } = startMatch(setup(91, [deckA, deckA], [...CARDS, lead]));
  const a = state.turn as Seat;
  return { state, a, b: opponent(a) };
}

function leaderPlays(state: MatchState, seat: Seat) {
  return legalActions(state, seat).filter((x) => x.type === "leader");
}

describe("active Leader abilities", () => {
  it("take the Turn, work once per Match, and not after Passing", () => {
    const { state, a, b } = board({ type: "clearWeather" });
    expect(leaderPlays(state, a)).toEqual([{ type: "leader" }]);
    const { state: used, events } = act(state, a, { type: "leader" });
    expect(used.turn).toBe(b);
    expect(used.sides[a].leaderUsed).toBe(true);
    expect(events[0]).toEqual({ type: "leaderUsed", seat: a, ability: "clearWeather" });
    const { state: back } = act(used, b, { type: "pass" });
    expect(leaderPlays(back, a)).toEqual([]);
    expect(applyAction(back, a, { type: "leader" }).ok).toBe(false);
    expect(viewFor(back, a).you.leader).toEqual({
      cardId: "leader-clearWeather",
      used: true,
      passive: false,
      cancelled: false,
    });
  });

  it("cannot be used after Passing", () => {
    const { state, a } = board({ type: "clearWeather" });
    const { state: passed } = act(state, a, { type: "pass" });
    expect(applyAction(passed, a, { type: "leader" }).ok).toBe(false);
    // Even with the Turn handed back by hand, a Seat that has Passed has no Leader action.
    expect(leaderPlays({ ...passed, turn: a }, a)).toEqual([]);
  });

  it("Clear Weather discards every Weather card", () => {
    const { state, a } = board({ type: "clearWeather" });
    const knight = place(state, a, "knight", "close");
    const frost = place(state, a, "frost", "weather");
    const { state: after } = act(state, a, { type: "leader" });
    expect(after.weather).toEqual([]);
    expect(after.sides[a].discard).toContain(frost);
    expect(computeStrengths(after).get(knight)).toBe(6);
  });

  it("Horn one of your Rows whose Horn slot is empty", () => {
    const { state, a } = board({ type: "hornRow" });
    const knight = place(state, a, "knight", "close");
    expect(leaderPlays(state, a)).toEqual([
      { type: "leader", row: "close" },
      { type: "leader", row: "ranged" },
      { type: "leader", row: "siege" },
    ]);
    const { state: after } = act(state, a, { type: "leader", row: "close" });
    expect(after.sides[a].rows.close.leaderHorn).toBe(true);
    expect(computeStrengths(after).get(knight)).toBe(12);
  });

  it("Scorch the opponent's named Row if its Score is 10 or more", () => {
    const { state, a, b } = board({ type: "scorchRow", row: "close" });
    const six = place(state, b, "knight", "close");
    const hero = place(state, b, "hero", "close");
    const { state: after, events } = act(state, a, { type: "leader" });
    expect(after.sides[b].rows.close.units).toEqual([hero]);
    expect(after.sides[b].discard).toEqual([six]);
    expect(events.some((e) => e.type === "destroyed")).toBe(true);

    const quiet = board({ type: "scorchRow", row: "ranged" });
    place(quiet.state, quiet.b, "archer", "ranged");
    const { events: none } = act(quiet.state, quiet.a, { type: "leader" });
    expect(none.some((e) => e.type === "destroyed")).toBe(false);
  });

  it("take a Weather card of your choice from your deck and play it (Pending Choice)", () => {
    const { state, a, b } = board({ type: "playWeatherFromDeck" });
    // Make sure both Weather cards are in the deck.
    for (const id of ["frost", "fog"]) {
      const i = state.sides[a].hand.findIndex((u) => state.cards[u]?.cardId === id);
      if (i >= 0) state.sides[a].deck.push(...state.sides[a].hand.splice(i, 1));
    }
    const { state: choosing } = act(state, a, { type: "leader" });
    expect(choosing.turn).toBe(a);
    expect(legalActions(choosing, a)).toEqual([
      { type: "choose", cardId: "fog" },
      { type: "choose", cardId: "frost" },
    ]);
    const { state: after, events } = act(choosing, a, { type: "choose", cardId: "frost" });
    expect(after.weather.map((u) => after.cards[u]?.cardId)).toEqual(["frost"]);
    expect(events[0]).toMatchObject({ type: "cardPlayed", zone: "weather", via: "leader" });
    expect(after.turn).toBe(b);
  });

  it("is not usable when there is nothing to act on", () => {
    const weather = board({ type: "playWeatherFromDeck" });
    for (const id of ["frost", "fog"]) toHand(weather.state, weather.a, id);
    expect(leaderPlays(weather.state, weather.a)).toEqual([]);

    const ret = board({ type: "returnFromDiscard" });
    expect(leaderPlays(ret.state, ret.a)).toEqual([]);
  });

  it("return a card from your Discard Pile to your hand (Pending Choice)", () => {
    const { state, a } = board({ type: "returnFromDiscard" });
    const hero = toHand(state, a, "hero");
    state.sides[a].hand.splice(state.sides[a].hand.indexOf(hero), 1);
    state.sides[a].discard.push(hero);
    const { state: choosing } = act(state, a, { type: "leader" });
    expect(legalActions(choosing, a)).toEqual([{ type: "choose", card: hero }]);
    const { state: after, events } = act(choosing, a, { type: "choose", card: hero });
    expect(after.sides[a].hand).toContain(hero);
    expect(after.sides[a].discard).toEqual([]);
    expect(events).toContainEqual({
      type: "returnedToHand",
      seat: a,
      card: { uid: hero, cardId: "hero" },
    });
  });

  it("draw a card of your choice from your deck, then shuffle (private Pending Choice)", () => {
    const { state, a, b } = board({ type: "drawChosenFromDeck" });
    const { state: choosing } = act(state, a, { type: "leader" });
    const options = legalActions(choosing, a);
    expect(options.every((o) => o.type === "choose" && o.cardId && o.card === undefined)).toBe(
      true,
    );
    expect(viewFor(choosing, b).legalActions).toEqual([]);
    expect(viewFor(choosing, b).opponentChoosing).toBe(true);
    const pick = options[0] as { cardId: string };
    const handBefore = choosing.sides[a].hand.length;
    const { state: after, events } = act(choosing, a, { type: "choose", cardId: pick.cardId });
    expect(after.sides[a].hand).toHaveLength(handBefore + 1);
    expect(after.cards[after.sides[a].hand.at(-1) as Uid]?.cardId).toBe(pick.cardId);
    expect(filterEvents(events, b).find((e) => e.type === "drew")).toEqual({
      type: "drew",
      seat: a,
      count: 1,
    });
  });

  it("look at 3 random cards in the opponent's hand; they stay known while there", () => {
    const { state, a, b } = board({ type: "lookAtOpponentHand" });
    const { state: after, events } = act(state, a, { type: "leader" });
    const revealed = events.find((e) => e.type === "handRevealed");
    expect(revealed?.type === "handRevealed" && revealed.cards).toHaveLength(3);
    const known = viewFor(after, a).opponent.knownHand;
    expect(known).toHaveLength(3);
    for (const card of known) expect(after.sides[b].hand).toContain(card.uid);
    expect(viewFor(after, b).you.seenByOpponent.sort()).toEqual(known.map((c) => c.uid).sort());

    // Once a known card leaves the hand it is no longer listed.
    const seen = known[0] as { uid: Uid; cardId: string };
    const def = after.defs[seen.cardId];
    const row = def?.kind === "unit" ? def.row : "close";
    const { state: played } = act(after, b, { type: "play", card: seen.uid, row });
    expect(viewFor(played, a).opponent.knownHand.map((c) => c.uid)).not.toContain(seen.uid);
  });

  it("keeps an empty-handed Seat in the Round while its Leader is usable", () => {
    const { state, a, b } = board({ type: "clearWeather" });
    state.sides[a].deck.push(...state.sides[a].hand.splice(0));
    expect(leaderPlays(state, a)).toEqual([{ type: "leader" }]);
    const { state: after } = act(state, a, { type: "leader" });
    expect(after.sides[a].passed).toBe(false);
    // Leader used and hand empty: a is Passed automatically when its Turn comes back.
    const { events } = act(after, b, { type: "pass" });
    expect(events).toContainEqual({ type: "passed", seat: a, reason: "nothingToDo" });
  });
});
