import { describe, expect, it } from "vitest";
import { legalActions } from "./legal";
import { applyAction, createMatch } from "./match";
import type { MatchState, Uid } from "./state";
import { act, deck, repeat, setup, unit } from "./testing/fixtures";
import { filterEvents, viewFor } from "./view";

const CARDS = [unit("a", 2), unit("b", 4), unit("c", 6, "ranged")];
const LIST = [...repeat("a", 8), ...repeat("b", 8), ...repeat("c", 8)];
const SETUP = setup(61, [deck(LIST), deck(LIST, "court")], CARDS);

function fresh(seed = 61): MatchState {
  return createMatch({ ...SETUP, seed }).state;
}

describe("Redraw", () => {
  it("both Seats Redraw at the same time: each may return a hand card or confirm", () => {
    const state = fresh();
    for (const seat of [0, 1] as const) {
      const legal = legalActions(state, seat);
      expect(legal).toHaveLength(11);
      expect(legal.at(-1)).toEqual({ type: "confirmRedraw" });
    }
  });

  it("returning 0 cards: confirming keeps the hand", () => {
    const state = fresh();
    const hand = [...state.sides[0].hand];
    const { state: after, events } = act(state, 0, { type: "confirmRedraw" });
    expect(after.sides[0].hand).toEqual(hand);
    expect(after.sides[0].redraw).toEqual({ returned: 0, done: true });
    expect(events).toEqual([{ type: "redrawDone", seat: 0, returned: 0 }]);
    expect(after.phase).toBe("redraw");
    expect(legalActions(after, 0)).toEqual([]);
  });

  it("returning 1 card shuffles it back and draws a replacement", () => {
    const state = fresh();
    const card = state.sides[0].hand[0] as Uid;
    const { state: after, events } = act(state, 0, { type: "redraw", card });
    expect(after.sides[0].hand).toHaveLength(10);
    expect(after.sides[0].hand.slice(0, 9)).not.toContain(card);
    expect(after.sides[0].deck.length).toBe(14);
    expect(after.sides[0].redraw).toEqual({ returned: 1, done: false });
    expect(events.map((e) => e.type)).toEqual(["cardReturned", "drew"]);
  });

  it("returning 2 cards confirms automatically", () => {
    let state = fresh();
    for (let i = 0; i < 2; i++) {
      ({ state } = act(state, 1, { type: "redraw", card: state.sides[1].hand[0] as Uid }));
    }
    expect(state.sides[1].redraw).toEqual({ returned: 2, done: true });
    expect(legalActions(state, 1)).toEqual([]);
  });

  it("the replacement can be the returned card", () => {
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const state = fresh(seed);
      const card = state.sides[0].hand[0] as Uid;
      const { state: after } = act(state, 0, { type: "redraw", card });
      found = after.sides[0].hand.at(-1) === card;
    }
    expect(found).toBe(true);
  });

  it("rejects Turn actions during Redraw", () => {
    const state = fresh();
    const card = state.sides[0].hand[0] as Uid;
    expect(applyAction(state, 0, { type: "play", card, row: "close" })).toMatchObject({
      ok: false,
      rejection: { code: "invalid_action" },
    });
    expect(applyAction(state, 0, { type: "pass" }).ok).toBe(false);
    const { state: done } = act(state, 0, { type: "confirmRedraw" });
    expect(applyAction(done, 0, { type: "redraw", card: done.sides[0].hand[0] as Uid }).ok).toBe(
      false,
    );
  });

  it("the first Turn starts when both have confirmed", () => {
    let state = fresh();
    ({ state } = act(state, 0, { type: "confirmRedraw" }));
    expect(state.turn).toBeNull();
    const { state: after, events } = act(state, 1, { type: "confirmRedraw" });
    expect(after.phase).toBe("turns");
    expect(after.turn).toBe(after.roundStarter);
    expect(events).toContainEqual({ type: "roundStarted", round: 1, starter: after.roundStarter });
  });

  it("the opponent's view and events show only how many cards were returned", () => {
    const state = fresh();
    const card = state.sides[0].hand[0] as Uid;
    const { state: after, events } = act(state, 0, { type: "redraw", card });
    expect(viewFor(after, 1).opponent.redraw).toEqual({ returned: 1, done: false });
    expect(viewFor(after, 0).you.redraw).toEqual({ returned: 1, done: false });
    const theirs = filterEvents(events, 1);
    expect(theirs).toEqual([
      { type: "cardReturned", seat: 0 },
      { type: "drew", seat: 0, count: 1 },
    ]);
    const mine = filterEvents(events, 0);
    expect(mine[0]).toEqual({
      type: "cardReturned",
      seat: 0,
      card: { uid: card, cardId: after.cards[card]?.cardId },
    });
  });
});
