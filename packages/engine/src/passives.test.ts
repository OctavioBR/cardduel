import { describe, expect, it } from "vitest";
import type { MatchEvent } from "./events";
import type { DeckSpec, MatchState, Seat, Uid } from "./state";
import { act, deck, place, repeat, setup, startMatch, toHand, unit } from "./testing/fixtures";

const CARDS = [
  unit("knight", 6, "close"),
  unit("archer", 4, "ranged"),
  unit("hero", 10, "close", { hero: true }),
  unit("spy", 3, "ranged", { abilities: ["spy"] }),
  unit("medic", 1, "siege", { abilities: ["medic"] }),
];
const LIST = [...repeat("knight", 6), ...repeat("archer", 6), "hero", ...repeat("spy", 2), "medic"];

/** `factions[0]` belongs to `a`, the Seat to move first; `factions[1]` to `b`. */
function board(factions: [DeckSpec["faction"], DeckSpec["faction"]], seed = 81) {
  const { state } = startMatch(setup(seed, [deck(LIST), deck(LIST)], CARDS));
  const a = state.turn as Seat;
  const b = (a === 0 ? 1 : 0) as Seat;
  state.sides[a].faction = factions[0];
  state.sides[b].faction = factions[1];
  return { state, a, b };
}

/** Both Pass; returns the state after the Round ended and its events. */
function endRound(
  state: MatchState,
  a: Seat,
  b: Seat,
): { state: MatchState; events: MatchEvent[] } {
  const first = act(state, a, { type: "pass" });
  return act(first.state, b, { type: "pass" });
}

function onBoard(state: MatchState, seat: Seat): Uid[] {
  return Object.values(state.sides[seat].rows).flatMap((r) => r.units);
}

describe("Swarm", () => {
  it("keeps one random non-Hero Unit it controls into the next Round (Swarm against Swarm)", () => {
    const { state, a, b } = board(["swarm", "swarm"]);
    const mine = [place(state, a, "knight", "close"), place(state, a, "archer", "ranged")];
    const theirs = [place(state, b, "knight", "close")];
    const { state: next, events } = endRound(state, a, b);
    expect(next.round).toBe(2);
    const keptA = onBoard(next, a);
    const keptB = onBoard(next, b);
    expect(keptA).toHaveLength(1);
    expect(mine).toContain(keptA[0]);
    expect(keptB).toEqual(theirs);
    expect(next.sides[a].discard).toHaveLength(1);
    const passives = events.filter((e) => e.type === "factionPassive");
    expect(passives).toHaveLength(2);
    expect(passives).toContainEqual(
      expect.objectContaining({
        seat: a,
        faction: "swarm",
        effect: "keptUnit",
        card: expect.objectContaining({ uid: keptA[0] }),
      }),
    );
  });

  it("chooses with the seeded generator: the same seed keeps the same Unit", () => {
    const run = () => {
      const { state, a, b } = board(["swarm", "court"], 99);
      place(state, a, "knight", "close");
      place(state, a, "archer", "ranged");
      place(state, a, "knight", "close");
      return onBoard(endRound(state, a, b).state, a);
    };
    expect(run()).toEqual(run());
  });

  it("keeps nothing when it has only Heroes", () => {
    const { state, a, b } = board(["swarm", "court"]);
    place(state, a, "hero", "close");
    const { state: next, events } = endRound(state, a, b);
    expect(onBoard(next, a)).toEqual([]);
    expect(events.some((e) => e.type === "factionPassive" && e.faction === "swarm")).toBe(false);
  });

  it("can keep an opponent's Spy sitting on its side, without firing on-play abilities", () => {
    const { state, a, b } = board(["court", "swarm"]);
    const spy = toHand(state, a, "spy");
    let s = act(state, a, { type: "play", card: spy, row: "ranged" }).state;
    // The Spy now sits on b's side, and it is b's only Unit.
    expect(onBoard(s, b)).toEqual([spy]);
    const handB = s.sides[b].hand.length;
    s = act(s, b, { type: "pass" }).state;
    const { state: next } = act(s, a, { type: "pass" });
    expect(onBoard(next, b)).toEqual([spy]);
    expect(next.sides[b].hand).toHaveLength(handB);
    expect(next.pending).toEqual([]);
  });
});

describe("Court", () => {
  it("wins a Tie against a non-Court player, and starts the next Round", () => {
    const { state, a, b } = board(["swarm", "court"]);
    place(state, a, "knight", "close");
    place(state, b, "knight", "close");
    const { state: next, events } = endRound(state, a, b);
    expect(events).toContainEqual({
      type: "factionPassive",
      seat: b,
      faction: "court",
      effect: "wonTie",
    });
    expect(events).toContainEqual(expect.objectContaining({ type: "roundEnded", winner: b }));
    expect(next.sides[a].gems).toBe(1);
    expect(next.sides[b].gems).toBe(2);
    expect(next.turn).toBe(b);
    // Swarm still keeps its Unit after losing the Tie.
    expect(onBoard(next, a)).toHaveLength(1);
  });

  it("Court against Court: a Tie costs both a Gem", () => {
    const { state, a, b } = board(["court", "court"]);
    place(state, a, "knight", "close");
    place(state, b, "knight", "close");
    const { state: next, events } = endRound(state, a, b);
    expect(events.some((e) => e.type === "factionPassive")).toBe(false);
    expect([next.sides[0].gems, next.sides[1].gems]).toEqual([1, 1]);
  });
});
