import { describe, expect, it } from "vitest";
import type { CardDefinition, LeaderAbility } from "./cards";
import { legalActions, timedOutAction } from "./legal";
import { applyAction, createMatch } from "./match";
import { type DeckSpec, type MatchState, opponent, type Seat } from "./state";
import { computeStrengths } from "./strength";
import { act, deck, place, repeat, setup, startMatch, unit } from "./testing/fixtures";
import { viewFor } from "./view";

const CARDS: CardDefinition[] = [
  unit("knight", 6, "close"),
  unit("archer", 4, "ranged"),
  unit("scout", 6, "close", { abilities: ["agile"] }),
  unit("drummer", 2, "ranged", { abilities: ["horn"] }),
];
const LIST = [...repeat("knight", 8), ...repeat("archer", 8), ...repeat("scout", 4), "drummer"];

function confirmBoth(state: MatchState) {
  const events = [];
  let s = state;
  for (const seat of [0, 1] as const) {
    const r = act(s, seat, { type: "confirmRedraw" });
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

function match(factions: [DeckSpec["faction"], DeckSpec["faction"]], seed = 5) {
  return createMatch(setup(seed, [deck(LIST, factions[0]), deck(LIST, factions[1])], CARDS)).state;
}

describe("Elves", () => {
  it("chooses who takes the first Turn after both Redraws", () => {
    const { state, events } = confirmBoth(match(["swarm", "elves"]));
    expect(state.pending).toEqual([{ seat: 1, kind: "firstTurn" }]);
    expect(state.turn).toBe(1);
    expect(events.some((e) => e.type === "roundStarted")).toBe(false);
    expect(legalActions(state, 1)).toEqual([
      { type: "choose", starter: 1 },
      { type: "choose", starter: 0 },
    ]);
    expect(legalActions(state, 0)).toEqual([]);
    expect(viewFor(state, 0).opponentChoosing).toBe(true);
    expect(viewFor(state, 1).legalActions.every((a) => !("preview" in a))).toBe(true);

    const { state: started, events: after } = act(state, 1, { type: "choose", starter: 0 });
    expect(started.pending).toEqual([]);
    expect(started.roundStarter).toBe(0);
    expect(started.turn).toBe(0);
    expect(after).toEqual([
      { type: "factionPassive", seat: 1, faction: "elves", effect: "choseStarter", starter: 0 },
      { type: "roundStarted", round: 1, starter: 0 },
    ]);
  });

  it("takes the first Turn itself when its Turn Timer runs out", () => {
    const { state } = confirmBoth(match(["elves", "court"]));
    expect(timedOutAction(state, 0)).toEqual({ type: "choose", starter: 0 });
  });

  it("does not choose when both players are Elves, nor in later Rounds", () => {
    const { state, events } = confirmBoth(match(["elves", "elves"]));
    expect(state.pending).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "roundStarted", round: 1 }));

    const { state: chosen } = act(confirmBoth(match(["elves", "swarm"])).state, 0, {
      type: "choose",
      starter: 0,
    });
    const passed = act(chosen, 0, { type: "pass" }).state;
    const round2 = applyAction(passed, 1, { type: "pass" });
    expect(round2.ok && round2.state.round).toBe(2);
    expect(round2.ok && round2.state.pending).toEqual([]);
  });
});

function leaderBoard(ability: LeaderAbility) {
  const lead: CardDefinition = {
    id: `leader-${ability.type}`,
    kind: "leader",
    faction: "elves",
    maxCopies: 1,
    ability,
  };
  const spec = { ...deck(LIST), leader: lead.id };
  const { state } = startMatch(setup(9, [spec, spec], [...CARDS, lead]));
  const a = state.turn as Seat;
  return { state, a, b: opponent(a) };
}

describe("Elves Leaders", () => {
  it("moveAgileUnits moves each Agile Unit to the Row where it is stronger", () => {
    const { state, a } = leaderBoard({ type: "moveAgileUnits" });
    const scouts = [place(state, a, "scout", "close"), place(state, a, "scout", "close")];
    place(state, a, "drummer", "ranged"); // Horn doubles the other Units on Ranged
    expect(legalActions(state, a).filter((x) => x.type === "leader")).toEqual([{ type: "leader" }]);
    const { state: after, events } = act(state, a, { type: "leader" });
    expect(after.sides[a].rows.close.units).toEqual([]);
    expect(after.sides[a].rows.ranged.units).toEqual(expect.arrayContaining(scouts));
    const strengths = computeStrengths(after);
    expect(scouts.map((u) => strengths.get(u))).toEqual([12, 12]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "unitsMoved",
        seat: a,
        moves: [
          expect.objectContaining({ from: "close", to: "ranged" }),
          expect.objectContaining({ from: "close", to: "ranged" }),
        ],
      }),
    );
  });

  it("moveAgileUnits is not usable when no Agile Unit would be stronger", () => {
    const { state, a } = leaderBoard({ type: "moveAgileUnits" });
    place(state, a, "scout", "close");
    expect(legalActions(state, a).filter((x) => x.type === "leader")).toEqual([]);
    expect(state.sides[a].rows.close.units).toHaveLength(1);
  });

  it("drawFromDeck draws one card and takes the Turn", () => {
    const { state, a, b } = leaderBoard({ type: "drawFromDeck" });
    const hand = state.sides[a].hand.length;
    const { state: after } = act(state, a, { type: "leader" });
    expect(after.sides[a].hand).toHaveLength(hand + 1);
    expect(after.turn).toBe(b);
  });
});
