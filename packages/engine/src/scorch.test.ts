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
  unit("sapper", 8, "siege", { abilities: ["scorch"] }),
  unit("flame", 8, "siege", { abilities: ["sideScorch"] }),
  unit("bond", 3, "close", { abilities: ["tightBond"] }),
  special("scorch", { type: "scorch" }),
  special("frost", { type: "weather", rows: ["close"] }),
];
const LIST = [
  ...repeat("u3", 2),
  ...repeat("u4", 3),
  ...repeat("u5", 3),
  ...repeat("u6", 3),
  "u9",
  "hero",
  "archer",
  ...repeat("torch", 2),
  "sapper",
  "flame",
  ...repeat("bond", 2),
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

  it("after Weather on Close, destroys every Close Unit when no other Unit is stronger", () => {
    const { state, a, b } = board();
    const units = [
      place(state, a, "u6", "close"),
      place(state, a, "u4", "close"),
      place(state, b, "u9", "close"),
      place(state, b, "bond", "close"),
    ];
    place(state, a, "frost", "weather");
    const scorch = toHand(state, a, "scorch");
    const { state: after } = act(state, a, { type: "play", card: scorch });
    for (const uid of units) expect(onBoard(after, uid)).toBe(false);
  });

  it("after Weather on Close, spares Units outranked by a Tight Bond pair or another Row", () => {
    const { state, a, b } = board();
    const weathered = [place(state, a, "u6", "close"), place(state, b, "u9", "close")];
    const bonds = [place(state, b, "bond", "close"), place(state, b, "bond", "close")];
    place(state, a, "frost", "weather");
    const scorch = toHand(state, a, "scorch");
    const { state: bonded } = act(state, a, { type: "play", card: scorch });
    for (const uid of bonds) expect(onBoard(bonded, uid)).toBe(false);
    for (const uid of weathered) expect(onBoard(bonded, uid)).toBe(true);

    const fresh = board();
    const close = place(fresh.state, fresh.a, "u9", "close");
    const archer = place(fresh.state, fresh.b, "archer", "ranged");
    place(fresh.state, fresh.a, "frost", "weather");
    const again = toHand(fresh.state, fresh.a, "scorch");
    const { state: ranged } = act(fresh.state, fresh.a, { type: "play", card: again });
    expect(onBoard(ranged, archer)).toBe(false);
    expect(onBoard(ranged, close)).toBe(true);
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

  it("hits a Leader-Horned Row of 4s when played on that same Row", () => {
    const { state, a, b } = board();
    const fours = [0, 1, 2].map(() => place(state, b, "u4", "close"));
    state.sides[b].rows.close.leaderHorn = true;
    const torch = toHand(state, a, "torch");
    const { state: after } = act(state, a, { type: "play", card: torch, row: "close" });
    for (const uid of fours) expect(onBoard(after, uid)).toBe(false);
  });

  it("from the Siege Row, checks only the opponent's Siege Row", () => {
    const { state, a, b } = board();
    const fours = [0, 1, 2].map(() => place(state, b, "u4", "close"));
    state.sides[b].rows.close.leaderHorn = true;
    const sapper = toHand(state, a, "sapper");
    const { state: after, events } = act(state, a, { type: "play", card: sapper, row: "siege" });
    for (const uid of fours) expect(onBoard(after, uid)).toBe(true);
    expect(events.some((e) => e.type === "destroyed")).toBe(false);
  });
});

describe("Side Scorch", () => {
  it("destroys the opponent's strongest non-Hero Units on any Row when their side has 10", () => {
    const { state, a, b } = board();
    const fours = [0, 1, 2].map(() => place(state, b, "u4", "close"));
    state.sides[b].rows.close.leaderHorn = true;
    const archer = place(state, b, "archer", "ranged");
    const mine = place(state, a, "u9", "close");
    const flame = toHand(state, a, "flame");
    const { state: after } = act(state, a, { type: "play", card: flame, row: "siege" });
    for (const uid of fours) expect(onBoard(after, uid)).toBe(false);
    expect(onBoard(after, archer)).toBe(true);
    expect(onBoard(after, mine)).toBe(true);
    expect(onBoard(after, flame)).toBe(true);
  });

  it("counts the whole side toward 10 but never destroys Heroes", () => {
    const { state, a, b } = board();
    const hero = place(state, b, "hero", "close");
    const archer = place(state, b, "archer", "ranged");
    const flame = toHand(state, a, "flame");
    const { state: after } = act(state, a, { type: "play", card: flame, row: "siege" });
    expect(onBoard(after, hero)).toBe(true);
    expect(onBoard(after, archer)).toBe(false);
  });

  it("does nothing when the opponent's side has 9", () => {
    const { state, a, b } = board();
    const five = place(state, b, "u5", "close");
    const archer = place(state, b, "archer", "ranged");
    const flame = toHand(state, a, "flame");
    const { state: after, events } = act(state, a, { type: "play", card: flame, row: "siege" });
    expect(onBoard(after, five)).toBe(true);
    expect(onBoard(after, archer)).toBe(true);
    expect(events.some((e) => e.type === "destroyed")).toBe(false);
  });
});
