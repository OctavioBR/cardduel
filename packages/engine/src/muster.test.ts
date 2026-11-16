import { describe, expect, it } from "vitest";
import { createMatch } from "./match";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
import { act, deck, repeat, setup, toHand, unit } from "./testing/fixtures";

const CARDS = [
  unit("knight", 6, "close"),
  unit("wasp", 2, "close", { abilities: ["muster"], musterGroup: "hive" }),
  unit("drone", 3, "ranged", { abilities: ["muster"], musterGroup: "hive" }),
  unit("nurse", 1, "siege", { abilities: ["muster", "medic"], musterGroup: "brood" }),
  unit("larva", 2, "siege", { abilities: ["muster"], musterGroup: "brood" }),
  unit("mole", 2, "close", { abilities: ["muster", "spy"], musterGroup: "brood" }),
  unit("loner", 4, "close", { abilities: ["muster"], musterGroup: "solo" }),
  unit("medic", 1, "siege", { abilities: ["medic"] }),
];
const LIST = [
  ...repeat("knight", 6),
  ...repeat("wasp", 3),
  ...repeat("drone", 2),
  "nurse",
  "larva",
  "mole",
  "loner",
  "medic",
];

function board(seed = 51): { state: MatchState; a: Seat; b: Seat } {
  const { state } = createMatch(setup(seed, [deck(LIST), deck(LIST, "court")], CARDS));
  const a = state.turn as Seat;
  return { state, a, b: opponent(a) };
}

function ids(state: MatchState, uids: Uid[]): string[] {
  return uids.map((u) => state.cards[u]?.cardId ?? "?").sort();
}

describe("Muster", () => {
  it("Plays every other card of the group from hand and deck, then shuffles the deck", () => {
    const { state, a } = board();
    const wasp = toHand(state, a, "wasp");
    const drone = toHand(state, a, "drone"); // one group member held in hand
    const deckBefore = [...state.sides[a].deck];
    const { state: after, events } = act(state, a, { type: "play", card: wasp, row: "close" });
    expect(ids(after, after.sides[a].rows.close.units)).toEqual(["wasp", "wasp", "wasp"]);
    expect(ids(after, after.sides[a].rows.ranged.units)).toEqual(["drone", "drone"]);
    expect(after.sides[a].hand).not.toContain(drone);
    const allIds = [...after.sides[a].hand, ...after.sides[a].deck].map(
      (u) => after.cards[u]?.cardId,
    );
    expect(allIds).not.toContain("wasp");
    expect(allIds).not.toContain("drone");
    const mustered = events.filter((e) => e.type === "cardPlayed" && e.via === "muster");
    expect(mustered).toHaveLength(4);
    // The remaining deck is the old deck minus group members, reshuffled by the seeded generator.
    const remaining = deckBefore.filter((u) => after.sides[a].deck.includes(u));
    expect([...after.sides[a].deck].sort()).toEqual([...remaining].sort());
  });

  it("with no group members left Plays only the card itself", () => {
    const { state, a } = board();
    const loner = toHand(state, a, "loner");
    const deckBefore = [...state.sides[a].deck];
    const { state: after, events } = act(state, a, { type: "play", card: loner, row: "close" });
    expect(after.sides[a].rows.close.units).toEqual([loner]);
    expect(after.sides[a].deck).toEqual(deckBefore);
    expect(events.filter((e) => e.type === "cardPlayed")).toHaveLength(1);
  });

  it("mustered cards fire their other on-play abilities but do not Muster again", () => {
    const { state, a, b } = board();
    const knight = toHand(state, a, "knight");
    const hand0 = state.sides[a].hand;
    hand0.splice(hand0.indexOf(knight), 1);
    state.sides[a].discard.push(knight);
    const larva = toHand(state, a, "larva");
    const handBefore = state.sides[a].hand.length;
    const groupInHand = state.sides[a].hand.filter((u) =>
      ["nurse", "mole"].includes(state.cards[u]?.cardId ?? ""),
    ).length;
    const { state: after, events } = act(state, a, { type: "play", card: larva, row: "siege" });
    // The mole (a Spy) went to the opponent's side and drew 2; the nurse (a Medic) asks for a choice.
    expect(ids(after, after.sides[b].rows.close.units)).toEqual(["mole"]);
    expect(events.filter((e) => e.type === "drew")).toHaveLength(1);
    expect(after.pending).toEqual([{ seat: a, kind: "medic" }]);
    expect(after.sides[a].hand).toHaveLength(handBefore - 1 - groupInHand + 2);
    // Each group member was Played once.
    const played = events
      .filter((e) => e.type === "cardPlayed")
      .map((e) => (e.type === "cardPlayed" ? e.card.cardId : ""));
    expect(played.sort()).toEqual(["larva", "mole", "nurse"]);
    expect(after.turn).toBe(a);
  });

  it("a Medic Playing a Muster card from the Discard Pile triggers its Muster", () => {
    const { state, a } = board();
    const wasp = toHand(state, a, "wasp");
    const hand = state.sides[a].hand;
    hand.splice(hand.indexOf(wasp), 1);
    state.sides[a].discard.push(wasp);
    const medic = toHand(state, a, "medic");
    let { state: s } = act(state, a, { type: "play", card: medic, row: "siege" });
    ({ state: s } = act(s, a, { type: "choose", card: wasp, row: "close" }));
    expect(ids(s, s.sides[a].rows.close.units)).toEqual(["wasp", "wasp", "wasp"]);
    expect(ids(s, s.sides[a].rows.ranged.units)).toEqual(["drone", "drone"]);
  });

  it("is deterministic: the same seed and actions give the same reshuffled deck", () => {
    const run = () => {
      const { state, a } = board(77);
      const wasp = toHand(state, a, "wasp");
      return act(state, a, { type: "play", card: wasp, row: "close" }).state.sides[a].deck;
    };
    expect(run()).toEqual(run());
  });
});
