import { describe, expect, it } from "vitest";
import type { MatchEvent } from "./events";
import { legalActions } from "./legal";
import { createMatch } from "./match";
import type { MatchState, Seat, Uid } from "./state";
import { computeStrengths, rowScore } from "./strength";
import { act, deck, place, repeat, setup, special, toHand, unit } from "./testing/fixtures";

const CARDS = [
  unit("knight", 6, "close"),
  unit("hero", 10, "close", { hero: true }),
  unit("archer", 5, "ranged"),
  unit("ram", 8, "siege"),
  unit("bond", 4, "close", { abilities: ["tightBond"] }),
  unit("drummer", 2, "close", { abilities: ["moraleBoost"] }),
  unit("bugler", 3, "close", { abilities: ["horn"] }),
  special("frost", { type: "weather", rows: ["close"] }),
  special("fog", { type: "weather", rows: ["ranged"] }),
  special("rain", { type: "weather", rows: ["siege"] }),
  special("storm", { type: "weather", rows: ["ranged", "siege"] }),
  special("sun", { type: "clearWeather" }),
  special("horn", { type: "horn" }),
];

const LIST = [
  ...repeat("knight", 3),
  "hero",
  "archer",
  "ram",
  ...repeat("bond", 3),
  ...repeat("drummer", 2),
  ...repeat("bugler", 2),
  "frost",
  "fog",
  "rain",
  "storm",
  "sun",
  ...repeat("horn", 2),
];

/** An empty board; returns the state with the Seat to move as `a`. */
function board(): { state: MatchState; a: Seat; b: Seat } {
  const { state } = createMatch(setup(11, [deck(LIST), deck(LIST, "court")], CARDS));
  const a = state.turn as Seat;
  return { state, a, b: a === 0 ? 1 : 0 };
}

function strength(state: MatchState, uid: Uid): number {
  return computeStrengths(state).get(uid) as number;
}

describe("Weather", () => {
  it("sets non-Hero Units on its Rows to 1 for both players, and Heroes ignore it", () => {
    const { state, a, b } = board();
    const knight = place(state, a, "knight", "close");
    const theirs = place(state, b, "knight", "close");
    const hero = place(state, a, "hero", "close");
    const archer = place(state, a, "archer", "ranged");
    place(state, a, "frost", "weather");
    expect(strength(state, knight)).toBe(1);
    expect(strength(state, theirs)).toBe(1);
    expect(strength(state, hero)).toBe(10);
    expect(strength(state, archer)).toBe(5);
  });

  it("Combined Weather covers Ranged and Siege, and several Weather cards stack", () => {
    const { state, a } = board();
    const knight = place(state, a, "knight", "close");
    const archer = place(state, a, "archer", "ranged");
    const ram = place(state, a, "ram", "siege");
    place(state, a, "storm", "weather");
    expect([strength(state, knight), strength(state, archer), strength(state, ram)]).toEqual([
      6, 1, 1,
    ]);
    place(state, a, "frost", "weather");
    expect(strength(state, knight)).toBe(1);
  });

  it("Weather cards are played to the shared zone with no target", () => {
    const { state, a } = board();
    const frost = toHand(state, a, "frost");
    const legal = legalActions(state, a).filter((x) => x.type === "play" && x.card === frost);
    expect(legal).toEqual([{ type: "play", card: frost }]);
    const { state: after, events } = act(state, a, { type: "play", card: frost });
    expect(after.weather).toEqual([frost]);
    expect(events[0]).toMatchObject({ type: "cardPlayed", zone: "weather" });
  });

  it("Clear Weather discards every Weather card and then itself", () => {
    const { state, a, b } = board();
    const knight = place(state, a, "knight", "close");
    const frost = place(state, a, "frost", "weather");
    const fog = place(state, b, "fog", "weather");
    const sun = toHand(state, a, "sun");
    const { state: after, events } = act(state, a, { type: "play", card: sun });
    expect(after.weather).toEqual([]);
    expect(after.sides[a].discard).toEqual([frost, sun]);
    expect(after.sides[b].discard).toEqual([fog]);
    expect(events).toContainEqual({
      type: "strengthChanged",
      changes: [{ uid: knight, from: 1, to: 6 }],
    });
  });
});

describe("Tight Bond", () => {
  it("multiplies by the number of same-named Units on the Row", () => {
    const { state, a } = board();
    const bonds = [place(state, a, "bond", "close"), place(state, a, "bond", "close")];
    expect(bonds.map((u) => strength(state, u))).toEqual([8, 8]);
    bonds.push(place(state, a, "bond", "close"));
    expect(bonds.map((u) => strength(state, u))).toEqual([12, 12, 12]);
  });

  it("applies after Weather: 1 x 3 = 3", () => {
    const { state, a } = board();
    const bonds = [1, 2, 3].map(() => place(state, a, "bond", "close"));
    place(state, a, "frost", "weather");
    expect(bonds.map((u) => strength(state, u))).toEqual([3, 3, 3]);
  });
});

describe("Morale Boost", () => {
  it("gives +1 to every other Unit on its Row, and several stack", () => {
    const { state, a } = board();
    const knight = place(state, a, "knight", "close");
    const d1 = place(state, a, "drummer", "close");
    expect([strength(state, knight), strength(state, d1)]).toEqual([7, 2]);
    const d2 = place(state, a, "drummer", "close");
    expect([strength(state, knight), strength(state, d1), strength(state, d2)]).toEqual([8, 3, 3]);
  });
});

describe("Horn", () => {
  it("the Horn Special Card doubles its Row", () => {
    const { state, a } = board();
    const knight = place(state, a, "knight", "close");
    const horn = toHand(state, a, "horn");
    const { state: after, events } = act(state, a, { type: "play", card: horn, row: "close" });
    expect(after.sides[a].rows.close.horn).toBe(horn);
    expect(strength(after, knight)).toBe(12);
    expect(events).toContainEqual({
      type: "strengthChanged",
      changes: [{ uid: knight, from: 6, to: 12 }],
    });
  });

  it("a Horn Unit doubles the other Units on its Row but not itself", () => {
    const { state, a } = board();
    const knight = place(state, a, "knight", "close");
    const bugler = place(state, a, "bugler", "close");
    expect([strength(state, knight), strength(state, bugler)]).toEqual([12, 3]);
  });

  it("doubles a Row at most once, and a Horn Unit is doubled by any other Horn", () => {
    const { state, a } = board();
    const knight = place(state, a, "knight", "close");
    const b1 = place(state, a, "bugler", "close");
    const b2 = place(state, a, "bugler", "close");
    expect([strength(state, knight), strength(state, b1), strength(state, b2)]).toEqual([12, 6, 6]);
    place(state, a, "horn", { horn: "close" });
    expect([strength(state, knight), strength(state, b1), strength(state, b2)]).toEqual([12, 6, 6]);
  });

  it("the Horn Special Card doubles a Horn Unit too", () => {
    const { state, a } = board();
    const bugler = place(state, a, "bugler", "close");
    place(state, a, "horn", { horn: "close" });
    expect(strength(state, bugler)).toBe(6);
  });

  it("is legal only on your Rows whose Horn slot is empty", () => {
    const { state, a } = board();
    place(state, a, "horn", { horn: "close" });
    const horn = toHand(state, a, "horn");
    const rows = legalActions(state, a)
      .filter((x) => x.type === "play" && x.card === horn)
      .map((x) => (x.type === "play" ? x.row : null));
    expect(rows).toEqual(["ranged", "siege"]);
  });
});

describe("combinations", () => {
  it("applies Weather, then Tight Bond, then Morale Boost, then Horn", () => {
    const { state, a } = board();
    const bonds = [place(state, a, "bond", "close"), place(state, a, "bond", "close")];
    const drummer = place(state, a, "drummer", "close");
    place(state, a, "horn", { horn: "close" });
    // Bond: 4 x 2 = 8; Morale: +1 = 9; Horn: x2 = 18.
    expect(bonds.map((u) => strength(state, u))).toEqual([18, 18]);
    // The drummer gets no Morale from itself: 2 x 2 = 4.
    expect(strength(state, drummer)).toBe(4);
    place(state, a, "frost", "weather");
    // Weather: 1; Bond: x2 = 2; Morale: +1 = 3; Horn: 6. Drummer: 1 x 2 = 2.
    expect(bonds.map((u) => strength(state, u))).toEqual([6, 6]);
    expect(strength(state, drummer)).toBe(2);
    expect(rowScore(state, a, "close")).toBe(14);
  });

  it("a Hero on a Weathered, Horned, boosted Row keeps its printed Strength", () => {
    const { state, a } = board();
    const hero = place(state, a, "hero", "close");
    place(state, a, "drummer", "close");
    place(state, a, "horn", { horn: "close" });
    place(state, a, "frost", "weather");
    expect(strength(state, hero)).toBe(10);
  });
});

describe("Round end", () => {
  it("Weather and Horn cards go to their player's Discard Pile", () => {
    const start = board();
    let state = start.state;
    const { a, b } = start;
    const frost = toHand(state, a, "frost");
    ({ state } = act(state, a, { type: "play", card: frost }));
    const horn = toHand(state, b, "horn");
    ({ state } = act(state, b, { type: "play", card: horn, row: "siege" }));
    ({ state } = act(state, a, { type: "pass" }));
    const ended = act(state, b, { type: "pass" });
    state = ended.state;
    const events: MatchEvent[] = ended.events;
    expect(events.some((e) => e.type === "roundEnded")).toBe(true);
    expect(state.weather).toEqual([]);
    expect(state.sides[a].discard).toContain(frost);
    expect(state.sides[b].discard).toContain(horn);
    expect(state.sides[b].rows.siege.horn).toBeNull();
  });
});
