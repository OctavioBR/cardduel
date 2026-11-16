import { describe, expect, it } from "vitest";
import { legalActions } from "./legal";
import { applyAction, createMatch } from "./match";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
import { act, deck, repeat, setup, toHand, unit } from "./testing/fixtures";
import { viewFor } from "./view";

const CARDS = [
  unit("knight", 6, "close"),
  unit("hero", 10, "close", { hero: true }),
  unit("medic", 1, "siege", { abilities: ["medic"] }),
  unit("spy", 3, "ranged", { abilities: ["spy"] }),
];
const LIST = [...repeat("knight", 8), "hero", ...repeat("medic", 3), ...repeat("spy", 2)];

function board(): { state: MatchState; a: Seat; b: Seat } {
  const { state } = createMatch(setup(41, [deck(LIST), deck(LIST, "court")], CARDS));
  const a = state.turn as Seat;
  return { state, a, b: opponent(a) };
}

/** Test-only: moves a card with this id from the Seat's deck or hand to its Discard Pile. */
function toDiscard(state: MatchState, seat: Seat, cardId: string): Uid {
  const uid = toHand(state, seat, cardId);
  const hand = state.sides[seat].hand;
  hand.splice(hand.indexOf(uid), 1);
  state.sides[seat].discard.push(uid);
  return uid;
}

describe("Medic", () => {
  it("raises a Pending Choice listing non-Hero Units in your Discard Pile", () => {
    const { state, a, b } = board();
    const knight = toDiscard(state, a, "knight");
    toDiscard(state, a, "hero");
    const medic = toHand(state, a, "medic");
    const { state: after, events } = act(state, a, { type: "play", card: medic, row: "siege" });
    expect(after.turn).toBe(a);
    expect(after.pending).toEqual([{ seat: a, kind: "medic" }]);
    expect(events).toContainEqual({ type: "choiceRequired", seat: a, kind: "medic" });
    expect(legalActions(after, a)).toEqual([{ type: "choose", card: knight, row: "close" }]);
    expect(legalActions(after, b)).toEqual([]);
    expect(viewFor(after, a).pendingChoice).toEqual({ kind: "medic" });
    expect(viewFor(after, b).pendingChoice).toBeNull();
    expect(viewFor(after, b).opponentChoosing).toBe(true);
    expect(viewFor(after, b).legalActions).toEqual([]);

    const { state: done } = act(after, a, { type: "choose", card: knight, row: "close" });
    expect(done.sides[a].rows.close.units).toEqual([knight]);
    expect(done.sides[a].discard).not.toContain(knight);
    expect(done.pending).toEqual([]);
    expect(done.turn).toBe(b);
  });

  it("rejects other actions while a choice is pending, but allows Forfeit", () => {
    const { state, a, b } = board();
    toDiscard(state, a, "knight");
    const medic = toHand(state, a, "medic");
    const { state: after } = act(state, a, { type: "play", card: medic, row: "siege" });
    const other = after.sides[a].hand[0] as Uid;
    expect(applyAction(after, a, { type: "pass" }).ok).toBe(false);
    expect(applyAction(after, a, { type: "play", card: other, row: "close" }).ok).toBe(false);
    expect(applyAction(after, b, { type: "pass" })).toMatchObject({ ok: false, rejection: { code: "not_your_turn" } });
    expect(applyAction(after, a, { type: "choose", card: 999, row: "close" }).ok).toBe(false);
    expect(applyAction(after, b, { type: "forfeit" }).ok).toBe(true);
  });

  it("a Medic Plays a Medic, which raises its own choice", () => {
    const { state, a, b } = board();
    const knight = toDiscard(state, a, "knight");
    const medic2 = toDiscard(state, a, "medic");
    const medic = toHand(state, a, "medic");
    let { state: s } = act(state, a, { type: "play", card: medic, row: "siege" });
    ({ state: s } = act(s, a, { type: "choose", card: medic2, row: "siege" }));
    expect(s.pending).toEqual([{ seat: a, kind: "medic" }]);
    expect(legalActions(s, a)).toEqual([{ type: "choose", card: knight, row: "close" }]);
    ({ state: s } = act(s, a, { type: "choose", card: knight, row: "close" }));
    expect(s.sides[a].rows.siege.units).toEqual([medic, medic2]);
    expect(s.sides[a].rows.close.units).toEqual([knight]);
    expect(s.turn).toBe(b);
  });

  it("a Medic Plays a Spy onto the opponent's side, drawing 2", () => {
    const { state, a, b } = board();
    const spy = toDiscard(state, a, "spy");
    const medic = toHand(state, a, "medic");
    const { state: s } = act(state, a, { type: "play", card: medic, row: "siege" });
    const hand = s.sides[a].hand.length;
    const { state: done, events } = act(s, a, { type: "choose", card: spy, row: "ranged" });
    expect(done.sides[b].rows.ranged.units).toEqual([spy]);
    expect(done.sides[a].hand).toHaveLength(hand + 2);
    expect(events.find((e) => e.type === "drew")).toMatchObject({ seat: a, count: 2 });
  });

  it("with an empty or Hero-only Discard Pile does nothing and raises no choice", () => {
    for (const fill of [[], ["hero"]]) {
      const { state, a, b } = board();
      for (const id of fill) toDiscard(state, a, id);
      const medic = toHand(state, a, "medic");
      const { state: after, events } = act(state, a, { type: "play", card: medic, row: "siege" });
      expect(after.pending).toEqual([]);
      expect(after.turn).toBe(b);
      expect(events.some((e) => e.type === "choiceRequired")).toBe(false);
    }
  });
});
