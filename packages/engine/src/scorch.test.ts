import { describe, expect, it } from "vitest";
import { type MatchState, opponent, type Seat, type Uid } from "./state";
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

const CARDS = [
  unit("u3", 3, "close"),
  unit("u4", 4, "close"),
  unit("u5", 5, "close"),
  unit("u6", 6, "close"),
  unit("u9", 9, "close"),
  unit("hero", 12, "close", { hero: true }),
  unit("archer", 4, "ranged"),
  unit("torch", 2, "close", { abilities: ["scorch"] }),
  special("scorch", { type: "scorch" }),
  special("frost", { type: "weather", rows: ["close"] }),
];
const LIST = [
  ...repeat("u3", 2),
  ...repeat("u4", 2),
  ...repeat("u5", 3),
  ...repeat("u6", 3),
  "u9",
  "hero",
  "archer",
  ...repeat("torch", 2),
  ...repeat("scorch", 2),
  "frost",
];

function board(): { state: MatchState; a: Seat; b: Seat } {
  const { state } = startMatch(setup(31, [deck(LIST), deck(LIST, "court")], CARDS));
  const a = state.turn as Seat;
  return { state, a, b: opponent(a) };
}

function onBoard(state: MatchState, uid: Uid): boolean {
  return state.sides.some((side) => Object.values(side.rows).some((r) => r.units.includes(uid)));
}

describe("Special Scorch", () => {
  it("destroys every highest non-Hero Unit on both sides, ties included, your own too", () => {
    const { state, a, b } = board();
    const mine6 = place(state, a, "u6", "close");
    const theirs6 = place(state, b, "u6", "close");
    const mine5 = place(state, a, "u5", "close");
    const hero = place(state, b, "hero", "close");
    const scorch = toHand(state, a, "scorch");
    const { state: after, events } = act(state, a, { type: "play", card: scorch });
    expect(onBoard(after, mine6)).toBe(false);
    expect(onBoard(after, theirs6)).toBe(false);
    expect(onBoard(after, mine5)).toBe(true);
    expect(onBoard(after, hero)).toBe(true);
    expect(after.sides[a].discard).toEqual([mine6, scorch]);
    expect(after.sides[b].discard).toEqual([theirs6]);
    const destroyed = events.find((e) => e.type === "destroyed");
    expect(destroyed?.type === "destroyed" && destroyed.cards.map((c) => c.uid).sort()).toEqual(
      [mine6, theirs6].sort(),
    );
  });

  it("uses current Strength: a Weathered 9 survives while an un-Weathered 4 is destroyed", () => {
    const { state, a, b } = board();
    const nine = place(state, a, "u9", "close");
    place(state, a, "frost", "weather");
    const archer = place(state, b, "archer", "ranged");
    const scorch = toHand(state, a, "scorch");
    const { state: after } = act(state, a, { type: "play", card: scorch });
    expect(onBoard(after, nine)).toBe(true);
    expect(onBoard(after, archer)).toBe(false);
  });

  it("does nothing to Heroes and nothing on an empty battlefield", () => {
    const { state, a } = board();
    const hero = place(state, a, "hero", "close");
    const scorch = toHand(state, a, "scorch");
    const { state: after, events } = act(state, a, { type: "play", card: scorch });
    expect(onBoard(after, hero)).toBe(true);
    expect(events.some((e) => e.type === "destroyed")).toBe(false);
    expect(after.sides[a].discard).toEqual([scorch]);
  });
});

describe("Unit Scorch", () => {
  it("destroys the opponent's highest non-Hero Units on the opposite Row at a Score of 10", () => {
    const { state, a, b } = board();
    const six = place(state, b, "u6", "close");
    const four = place(state, b, "u4", "close");
    const torch = toHand(state, a, "torch");
    const { state: after } = act(state, a, { type: "play", card: torch, row: "close" });
    expect(onBoard(after, six)).toBe(false);
    expect(onBoard(after, four)).toBe(true);
    expect(onBoard(after, torch)).toBe(true);
    expect(after.sides[b].discard).toEqual([six]);
  });

  it("does nothing at a Score of 9", () => {
    const { state, a, b } = board();
    const five = place(state, b, "u5", "close");
    const four = place(state, b, "u4", "close");
    const torch = toHand(state, a, "torch");
    const { state: after, events } = act(state, a, { type: "play", card: torch, row: "close" });
    expect(onBoard(after, five)).toBe(true);
    expect(onBoard(after, four)).toBe(true);
    expect(events.some((e) => e.type === "destroyed")).toBe(false);
  });

  it("counts Heroes toward the Score but never destroys them, and destroys ties", () => {
    const { state, a, b } = board();
    const hero = place(state, b, "hero", "close");
    const five1 = place(state, b, "u5", "close");
    const five2 = place(state, b, "u5", "close");
    const three = place(state, b, "u3", "close");
    const torch = toHand(state, a, "torch");
    const { state: after } = act(state, a, { type: "play", card: torch, row: "close" });
    expect(onBoard(after, hero)).toBe(true);
    expect(onBoard(after, five1)).toBe(false);
    expect(onBoard(after, five2)).toBe(false);
    expect(onBoard(after, three)).toBe(true);
  });
});
