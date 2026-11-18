import { describe, expect, it } from "vitest";
import type { LoggedAction } from "./actions";
import { timedOutAction, waitingOn } from "./legal";
import { applyAction, createMatch, replay } from "./match";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
import { act, deck, repeat, setup, startMatch, toHand, unit } from "./testing/fixtures";

const CARDS = [
  unit("knight", 6, "close"),
  unit("archer", 4, "ranged", { abilities: ["agile"] }),
  unit("medic", 1, "siege", { abilities: ["medic"] }),
];
const LIST = [...repeat("knight", 8), ...repeat("archer", 4), ...repeat("medic", 3)];
const SETUP = setup(41, [deck(LIST), deck(LIST, "court")], CARDS);

/** Test-only: moves a card with this id from the Seat's deck or hand to its Discard Pile. */
function toDiscard(state: MatchState, seat: Seat, cardId: string): Uid {
  const uid = toHand(state, seat, cardId);
  const hand = state.sides[seat].hand;
  hand.splice(hand.indexOf(uid), 1);
  state.sides[seat].discard.push(uid);
  return uid;
}

describe("Turn Timer expiry (ADR-0009)", () => {
  it("in Redraw, keeps the hand of each Seat that has not confirmed", () => {
    const { state } = createMatch(SETUP);
    expect(waitingOn(state, 0) && waitingOn(state, 1)).toBe(true);
    expect(timedOutAction(state, 0)).toEqual({ type: "confirmRedraw" });
    const { state: after } = act(state, 0, { type: "confirmRedraw" });
    expect(waitingOn(after, 0)).toBe(false);
    expect(timedOutAction(after, 0)).toBeNull();
    expect(timedOutAction(after, 1)).toEqual({ type: "confirmRedraw" });
  });

  it("on a Turn, Passes and says the Turn Timer ran out", () => {
    const { state } = startMatch(SETUP);
    const a = state.turn as Seat;
    expect(timedOutAction(state, opponent(a))).toBeNull();
    expect(timedOutAction(state, a)).toEqual({ type: "pass" });
    const result = applyAction(state, a, { type: "pass" }, { timedOut: true });
    if (!result.ok) throw new Error(result.rejection.message);
    expect(result.events).toContainEqual({ type: "passed", seat: a, reason: "turnTimer" });
    const chosen = applyAction(state, a, { type: "pass" });
    if (!chosen.ok) throw new Error(chosen.rejection.message);
    expect(chosen.events).toContainEqual({ type: "passed", seat: a, reason: "player" });
    expect(result.state).toEqual(chosen.state);
  });

  it("on a Medic's Pending Choice, takes the first Discard Pile card on its first allowed Row", () => {
    const { state } = startMatch(SETUP);
    const a = state.turn as Seat;
    const archer = toDiscard(state, a, "archer");
    toDiscard(state, a, "knight");
    const medic = toHand(state, a, "medic");
    const { state: after } = act(state, a, { type: "play", card: medic, row: "siege" });
    expect(after.pending).toEqual([{ seat: a, kind: "medic" }]);
    expect(timedOutAction(after, opponent(a))).toBeNull();
    expect(timedOutAction(after, a)).toEqual({ type: "choose", card: archer, row: "close" });
  });

  it("replays a log with timed-out entries to the same state", () => {
    const { state: created } = createMatch(SETUP);
    const log: LoggedAction[] = [];
    let state = created;
    const step = (seat: Seat, timedOut: boolean) => {
      const action = timedOutAction(state, seat);
      if (!action) throw new Error("Not waiting on this Seat");
      const result = applyAction(state, seat, action, { timedOut });
      if (!result.ok) throw new Error(result.rejection.message);
      log.push(timedOut ? { seat, action, timedOut: true } : { seat, action });
      state = result.state;
    };
    step(0, true);
    step(1, false);
    step(state.turn as Seat, true);
    expect(replay(SETUP, log)).toEqual(state);
  });
});
