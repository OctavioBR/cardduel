import { describe, expect, it } from "vitest";
import { legalActions } from "./legal";
import { applyAction, createMatch } from "./match";
import { type MatchState, opponent, type Seat } from "./state";
import { computeStrengths, rowScore } from "./strength";
import { act, deck, place, repeat, setup, special, toHand, unit } from "./testing/fixtures";
import { filterEvents } from "./view";

const CARDS = [
  unit("knight", 6, "close"),
  unit("hero", 10, "close", { hero: true }),
  unit("skirmisher", 4, "close", { abilities: ["agile"] }),
  unit("spy", 3, "ranged", { abilities: ["spy"] }),
  special("decoy", { type: "decoy" }),
];
const LIST = [
  ...repeat("knight", 8),
  "hero",
  ...repeat("skirmisher", 2),
  ...repeat("spy", 2),
  ...repeat("decoy", 2),
];

function board(): { state: MatchState; a: Seat; b: Seat } {
  const { state } = createMatch(setup(21, [deck(LIST), deck(LIST, "court")], CARDS));
  const a = state.turn as Seat;
  return { state, a, b: opponent(a) };
}

function playsOf(state: MatchState, seat: Seat, card: number) {
  return legalActions(state, seat).filter((x) => x.type === "play" && x.card === card);
}

describe("Agile", () => {
  it("is played to Close or Ranged, chosen by the play action", () => {
    const { state, a } = board();
    const skirmisher = toHand(state, a, "skirmisher");
    expect(playsOf(state, a, skirmisher)).toEqual([
      { type: "play", card: skirmisher, row: "close" },
      { type: "play", card: skirmisher, row: "ranged" },
    ]);
    const { state: after } = act(state, a, { type: "play", card: skirmisher, row: "ranged" });
    expect(after.sides[a].rows.ranged.units).toEqual([skirmisher]);
    expect(applyAction(state, a, { type: "play", card: skirmisher, row: "siege" })).toMatchObject({
      ok: false,
      rejection: { code: "invalid_row" },
    });
  });
});

describe("Spy", () => {
  it("goes to the opponent's matching Row, counts for them, and its player draws 2", () => {
    const { state, a, b } = board();
    const spy = toHand(state, a, "spy");
    const handBefore = state.sides[a].hand.length;
    const { state: after, events } = act(state, a, { type: "play", card: spy, row: "ranged" });
    expect(after.sides[b].rows.ranged.units).toEqual([spy]);
    expect(rowScore(after, b, "ranged")).toBe(3);
    expect(after.sides[a].hand).toHaveLength(handBefore - 1 + 2);
    expect(events[0]).toMatchObject({ type: "cardPlayed", seat: a, side: b, zone: "ranged" });
    const drew = events.find((e) => e.type === "drew");
    expect(drew).toMatchObject({ seat: a, count: 2 });
    expect(filterEvents(events, b).find((e) => e.type === "drew")).toEqual({
      type: "drew",
      seat: a,
      count: 2,
    });
  });

  it("with one card left in the deck draws just that card", () => {
    const { state, a } = board();
    const spy = toHand(state, a, "spy");
    state.sides[a].deck.splice(1);
    const { state: after, events } = act(state, a, { type: "play", card: spy, row: "ranged" });
    expect(after.sides[a].deck).toEqual([]);
    expect(events.find((e) => e.type === "drew")).toMatchObject({ count: 1 });
  });

  it("goes to its Controller's Discard Pile when it leaves the battlefield", () => {
    let { state, a, b } = board();
    const spy = toHand(state, a, "spy");
    ({ state } = act(state, a, { type: "play", card: spy, row: "ranged" }));
    ({ state } = act(state, b, { type: "pass" }));
    ({ state } = act(state, a, { type: "pass" }));
    expect(state.sides[b].discard).toContain(spy);
    expect(state.sides[a].discard).not.toContain(spy);
  });
});

describe("Decoy", () => {
  it("swaps with one of your non-Hero Units: the Unit returns to your hand, the Decoy has Strength 0", () => {
    const { state, a } = board();
    const knight = place(state, a, "knight", "close");
    const decoy = toHand(state, a, "decoy");
    const { state: after, events } = act(state, a, { type: "play", card: decoy, target: knight });
    expect(after.sides[a].rows.close.units).toEqual([decoy]);
    expect(after.sides[a].hand).toContain(knight);
    expect(computeStrengths(after).get(decoy)).toBe(0);
    expect(events).toContainEqual({
      type: "returnedToHand",
      seat: a,
      card: { uid: knight, cardId: "knight" },
    });
  });

  it("cannot target Heroes or Units on the opponent's side", () => {
    const { state, a, b } = board();
    const hero = place(state, a, "hero", "close");
    const theirs = place(state, b, "knight", "close");
    const mine = place(state, a, "knight", "close");
    const decoy = toHand(state, a, "decoy");
    expect(playsOf(state, a, decoy)).toEqual([{ type: "play", card: decoy, target: mine }]);
    for (const target of [hero, theirs]) {
      expect(applyAction(state, a, { type: "play", card: decoy, target })).toMatchObject({
        ok: false,
        rejection: { code: "invalid_target" },
      });
    }
  });

  it("has no targets on an empty side", () => {
    const { state, a } = board();
    const decoy = toHand(state, a, "decoy");
    expect(playsOf(state, a, decoy)).toEqual([]);
  });

  it("takes an opponent's Spy off your side, and playing it back draws 2 again", () => {
    let { state, a, b } = board();
    const spy = toHand(state, b, "spy");
    const knight = toHand(state, a, "knight");
    ({ state } = act(state, a, { type: "play", card: knight, row: "close" }));
    ({ state } = act(state, b, { type: "play", card: spy, row: "ranged" }));
    expect(state.sides[a].rows.ranged.units).toEqual([spy]);

    const decoy = toHand(state, a, "decoy");
    expect(playsOf(state, a, decoy)).toContainEqual({ type: "play", card: decoy, target: spy });
    ({ state } = act(state, a, { type: "play", card: decoy, target: spy }));
    expect(state.sides[a].hand).toContain(spy);

    ({ state } = act(state, b, { type: "pass" }));
    const handBefore = state.sides[a].hand.length;
    const { state: after, events } = act(state, a, { type: "play", card: spy, row: "ranged" });
    expect(after.sides[b].rows.ranged.units).toContain(spy);
    expect(events.find((e) => e.type === "drew")).toMatchObject({ seat: a, count: 2 });
    expect(after.sides[a].hand).toHaveLength(handBefore - 1 + 2);
  });
});
