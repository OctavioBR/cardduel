import { describe, expect, it } from "vitest";
import type { LoggedAction } from "./actions";
import { applyAction, createMatch, HAND_SIZE, replay } from "./match";
import { type MatchState, opponent, type Seat } from "./state";
import {
  act,
  deck,
  inHand,
  ownRow,
  playCard,
  repeat,
  setup,
  startMatch,
  unit,
} from "./testing/fixtures";

const FIVE = unit("five", 5, "close");
const THREE = unit("three", 3, "ranged");
// Court against Court: neither Faction passive changes these base rules (a Tie costs both).
const PLAIN = setup(
  42,
  [
    deck([...repeat("five", 8), ...repeat("three", 6)], "court"),
    deck([...repeat("five", 8), ...repeat("three", 6)], "court"),
  ],
  [FIVE, THREE],
);

function started(seed = 42): MatchState {
  return startMatch({ ...PLAIN, seed }).state;
}

describe("createMatch", () => {
  it("flips a coin, shuffles and deals 10 cards each, then waits for Redraw", () => {
    const { state, events } = createMatch(PLAIN);
    expect(state.sides[0].hand).toHaveLength(HAND_SIZE);
    expect(state.sides[1].hand).toHaveLength(HAND_SIZE);
    expect(state.sides[0].deck).toHaveLength(4);
    expect(state.phase).toBe("redraw");
    expect(state.turn).toBeNull();
    expect(events.map((e) => e.type)).toEqual(["coinFlip", "drew", "drew"]);
    expect(state.actionCount).toBe(0);
  });

  it("starts the first Turn with the coin-flip winner once both have Redrawn", () => {
    const { state, events } = startMatch(PLAIN);
    expect(state.phase).toBe("turns");
    expect(state.turn).toBe(state.roundStarter);
    expect(events.map((e) => e.type)).toEqual([
      "coinFlip",
      "drew",
      "drew",
      "redrawDone",
      "redrawDone",
      "roundStarted",
    ]);
  });

  it("is deterministic for a seed and gives different deals for different seeds", () => {
    expect(createMatch(PLAIN)).toEqual(createMatch(PLAIN));
    const deals = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      deals.add(JSON.stringify(createMatch({ ...PLAIN, seed }).state.sides[0].hand));
    }
    expect(deals.size).toBeGreaterThan(1);
  });

  it("lets both Seats win the coin flip across seeds", () => {
    const starters = new Set<Seat>();
    for (let seed = 0; seed < 20; seed++)
      starters.add(createMatch({ ...PLAIN, seed }).state.roundStarter);
    expect([...starters].sort()).toEqual([0, 1]);
  });

  it("produces plain JSON state", () => {
    const { state } = createMatch(PLAIN);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("Turns", () => {
  it("alternates Turns and skips a Seat that has Passed", () => {
    let state = started();
    const a = state.turn as Seat;
    const b = opponent(a);
    ({ state } = playCard(state, a, "five"));
    expect(state.turn).toBe(b);
    ({ state } = act(state, b, { type: "pass" }));
    expect(state.turn).toBe(a);
    ({ state } = playCard(state, a, "five"));
    expect(state.turn).toBe(a);
    // Two Redraw confirmations plus three Turns.
    expect(state.actionCount).toBe(5);
  });

  it("rejects illegal actions without changing state", () => {
    const state = started();
    const a = state.turn as Seat;
    const b = opponent(a);
    const before = JSON.stringify(state);

    const notYourTurn = applyAction(state, b, { type: "pass" });
    expect(notYourTurn).toMatchObject({ ok: false, rejection: { code: "not_your_turn" } });

    const notInHand = applyAction(state, a, { type: "play", card: inHand(state, b), row: "close" });
    expect(notInHand).toMatchObject({ ok: false, rejection: { code: "card_not_in_hand" } });

    const wrongRow = applyAction(state, a, {
      type: "play",
      card: inHand(state, a, "five"),
      row: "siege",
    });
    expect(wrongRow).toMatchObject({ ok: false, rejection: { code: "invalid_row" } });

    const { state: afterPass } = act(state, a, { type: "pass" });
    const { state: bPlayed } = playCard(afterPass, b, "five");
    // a has Passed: it is still b's Turn, and a acting after Passing is rejected.
    expect(bPlayed.turn).toBe(b);
    expect(
      applyAction(bPlayed, a, { type: "play", card: inHand(bPlayed, a), row: "close" }),
    ).toMatchObject({
      ok: false,
      rejection: { code: "not_your_turn" },
    });
    const passedBefore = JSON.stringify(bPlayed);
    const a2 = { ...bPlayed, turn: a };
    expect(applyAction(a2, a, { type: "pass" })).toMatchObject({
      ok: false,
      rejection: { code: "already_passed" },
    });
    expect(JSON.stringify(bPlayed)).toBe(passedBefore);

    expect(JSON.stringify(state)).toBe(before);
  });

  it("Passes a Seat automatically when its hand is empty", () => {
    const s = setup(7, [deck(repeat("five", 10)), deck(repeat("five", 10))], [FIVE]);
    let { state } = startMatch(s);
    // With a usable Leader ability a Seat is not Passed automatically, so spend both.
    for (const side of state.sides) side.leaderUsed = true;
    const a = state.turn as Seat;
    const b = opponent(a);
    ({ state } = playCard(state, a));
    ({ state } = act(state, b, { type: "pass" }));
    let last: ReturnType<typeof act>["events"] = [];
    for (let i = 0; i < 9; i++) ({ state, events: last } = playCard(state, a));
    expect(last).toContainEqual({ type: "passed", seat: a, reason: "nothingToDo" });
    expect(last.find((e) => e.type === "roundEnded")).toMatchObject({
      scores: seatScores(a, 50, 0),
      winner: a,
    });
    // Round 2: a has no cards, so it auto-Passes as soon as it gets the Turn (it starts as winner).
    expect(state.round).toBe(2);
    expect(state.sides[a].passed).toBe(true);
    expect(state.turn).toBe(b);
  });
});

function seatScores(seat: Seat, mine: number, theirs: number): [number, number] {
  return seat === 0 ? [mine, theirs] : [theirs, mine];
}

describe("Rounds and Gems", () => {
  it("the higher Score wins the Round, the loser loses a Gem, and the winner starts next", () => {
    let state = started();
    const a = state.turn as Seat;
    const b = opponent(a);
    ({ state } = playCard(state, a, "five"));
    ({ state } = playCard(state, b, "three"));
    ({ state } = act(state, a, { type: "pass" }));
    const { state: s2, events } = act(state, b, { type: "pass" });
    expect(events).toContainEqual({
      type: "roundEnded",
      round: 1,
      scores: seatScores(a, 5, 3),
      winner: a,
      gems: seatScores(a, 2, 1),
    });
    expect(events).toContainEqual({ type: "roundStarted", round: 2, starter: a });
    expect(s2.turn).toBe(a);
    expect(s2.sides[a].discard).toHaveLength(1);
    expect(s2.sides[b].discard).toHaveLength(1);
    expect(s2.sides[0].rows.close.units).toEqual([]);
  });

  it("a Tie costs both a Gem and the Seat that did not start the tied Round starts", () => {
    let state = started();
    const a = state.turn as Seat;
    const b = opponent(a);
    ({ state } = playCard(state, a, "five"));
    ({ state } = playCard(state, b, "five"));
    ({ state } = act(state, a, { type: "pass" }));
    const { state: s2, events } = act(state, b, { type: "pass" });
    expect(events).toContainEqual(
      expect.objectContaining({ type: "roundEnded", winner: null, gems: [1, 1] }),
    );
    expect(s2.roundStarter).toBe(b);
    expect(s2.turn).toBe(b);
  });

  it("losing your last Gem loses the Match", () => {
    let state = started();
    const a = state.turn as Seat;
    const b = opponent(a);
    for (let round = 0; round < 2; round++) {
      ({ state } = playCard(state, a, "five"));
      ({ state } = act(state, b, { type: "pass" }));
      ({ state } = act(state, a, { type: "pass" }));
    }
    expect(state.phase).toBe("ended");
    expect(state.result).toEqual({ outcome: "win", winner: a, reason: "gems" });
    expect(state.turn).toBeNull();
    expect(applyAction(state, a, { type: "pass" })).toMatchObject({
      ok: false,
      rejection: { code: "match_over" },
    });
  });

  it("both losing their last Gem in the same Round is a Draw", () => {
    let state = started();
    for (let round = 0; round < 2; round++) {
      const a = state.turn as Seat;
      ({ state } = act(state, a, { type: "pass" }));
      ({ state } = act(state, opponent(a), { type: "pass" }));
    }
    expect(state.result).toEqual({ outcome: "draw" });
  });

  it("can go to a third Round after one win each", () => {
    let state = started();
    const a = state.turn as Seat;
    const b = opponent(a);
    ({ state } = playCard(state, a, "five"));
    ({ state } = act(state, b, { type: "pass" }));
    ({ state } = act(state, a, { type: "pass" })); // a wins round 1, starts round 2
    ({ state } = act(state, a, { type: "pass" }));
    ({ state } = playCard(state, b, "three"));
    ({ state } = act(state, b, { type: "pass" })); // b wins round 2
    expect(state.round).toBe(3);
    expect(state.turn).toBe(b);
    expect([state.sides[0].gems, state.sides[1].gems]).toEqual([1, 1]);
  });
});

describe("Forfeit", () => {
  it("ends the Match at any time with a win for the opponent, even off-Turn", () => {
    const state = started();
    const off = opponent(state.turn as Seat);
    const { state: after, events } = act(state, off, { type: "forfeit" });
    expect(after.result).toEqual({ outcome: "win", winner: opponent(off), reason: "forfeit" });
    expect(events).toEqual([
      { type: "forfeited", seat: off },
      { type: "matchEnded", result: { outcome: "win", winner: opponent(off), reason: "forfeit" } },
    ]);
  });
});

describe("replay", () => {
  it("rebuilds the same state from seed plus action log", () => {
    let state = started();
    const log: LoggedAction[] = [
      { seat: 0, action: { type: "confirmRedraw" } },
      { seat: 1, action: { type: "confirmRedraw" } },
    ];
    for (let i = 0; i < 40 && state.phase !== "ended"; i++) {
      const seat = state.turn as Seat;
      const hand = state.sides[seat].hand;
      const action =
        i % 3 === 2 || hand.length === 0
          ? ({ type: "pass" } as const)
          : ({
              type: "play",
              card: hand[0] as number,
              row: ownRow(state, hand[0] as number),
            } as const);
      log.push({ seat, action });
      ({ state } = act(state, seat, action));
    }
    expect(replay(PLAIN, log)).toEqual(state);
  });

  it("matches a recorded fixture of events", () => {
    let { state, events } = startMatch({ ...PLAIN, seed: 1234 });
    const all = [...events];
    for (const step of [
      (s: MatchState) => playCard(s, s.turn as Seat, "five"),
      (s: MatchState) => playCard(s, s.turn as Seat, "three"),
      (s: MatchState) => act(s, s.turn as Seat, { type: "pass" }),
      (s: MatchState) => act(s, s.turn as Seat, { type: "pass" }),
    ]) {
      ({ state, events } = step(state));
      all.push(...events);
    }
    expect(all).toMatchSnapshot();
  });
});
