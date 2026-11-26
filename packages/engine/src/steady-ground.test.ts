import { describe, expect, it } from "vitest";
import type { CardDefinition } from "./cards";
import { legalActions } from "./legal";
import { applyAction } from "./match";
import { previewFor } from "./preview";
import { type MatchState, opponent, type Seat } from "./state";
import { computeStrengths, rowScore } from "./strength";
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
import { viewFor } from "./view";

const STEADY: CardDefinition = {
  id: "leader-steady",
  kind: "leader",
  faction: "court",
  maxCopies: 1,
  ability: { type: "passive", passive: "steadyGround" },
};

const CARDS = [
  unit("knight", 6, "close"),
  unit("archer", 5, "ranged"),
  unit("ram", 8, "siege"),
  unit("giant", 9, "siege", { hero: true }),
  special("rain", { type: "weather", rows: ["siege"] }),
  special("storm", { type: "weather", rows: ["ranged", "siege"] }),
  special("scorch", { type: "scorch" }),
  STEADY,
];
const LIST = [
  ...repeat("knight", 6),
  ...repeat("archer", 6),
  ...repeat("ram", 6),
  "giant",
  "rain",
  "storm",
  "scorch",
];

/** The Seat to move (`a`) leads with Steady Ground; its opponent `b` has a plain Leader. */
function board(): { state: MatchState; a: Seat; b: Seat } {
  const first = startMatch(setup(5, [deck(LIST, "court"), deck(LIST, "court")], CARDS)).state;
  const a = first.turn as Seat;
  const steady = { ...deck(LIST, "court"), leader: STEADY.id };
  const plain = deck(LIST, "court");
  const { state } = startMatch(setup(5, a === 0 ? [steady, plain] : [plain, steady], CARDS));
  return { state, a, b: opponent(a) };
}

const strength = (state: MatchState, uid: number) => computeStrengths(state).get(uid) as number;

describe("Steady Ground (passive Leader)", () => {
  it("keeps your Siege Row at full Strength under Siege Weather, but not the opponent's", () => {
    const { state, a, b } = board();
    const mine = place(state, a, "ram", "siege");
    const theirs = place(state, b, "ram", "siege");
    const knight = place(state, a, "knight", "close");
    place(state, a, "rain", "weather");
    expect(strength(state, mine)).toBe(8);
    expect(strength(state, theirs)).toBe(1);
    expect(strength(state, knight)).toBe(6);
  });

  it("under Combined Weather, protects Siege but still lowers your Ranged Row", () => {
    const { state, a, b } = board();
    const ram = place(state, a, "ram", "siege");
    const archer = place(state, a, "archer", "ranged");
    const theirRam = place(state, b, "ram", "siege");
    place(state, b, "storm", "weather");
    expect(strength(state, ram)).toBe(8);
    expect(strength(state, archer)).toBe(1);
    expect(strength(state, theirRam)).toBe(1);
  });

  it("leaves Heroes as they were", () => {
    const { state, a } = board();
    const giant = place(state, a, "giant", "siege");
    place(state, a, "rain", "weather");
    expect(strength(state, giant)).toBe(9);
  });

  it("applies from the start of the Match, with no Weather and no change to other Rows", () => {
    const { state, a } = board();
    const ram = place(state, a, "ram", "siege");
    expect(strength(state, ram)).toBe(8);
    expect(rowScore(state, a, "siege")).toBe(8);
  });

  it("Play Previews and Scorch agree: your protected Unit is the highest", () => {
    const { state, a, b } = board();
    const mine = place(state, a, "ram", "siege");
    const theirs = place(state, b, "ram", "siege");
    place(state, b, "rain", "weather");
    const another = toHand(state, a, "ram");
    const preview = previewFor(state, a, { type: "play", card: another, row: "siege" });
    expect(preview.rows.you.siege).toBe(16);
    expect(preview.rows.opponent.siege).toBe(1);
    // Scorch kills the highest Strength: only your own protected 8, not their weathered 1.
    const scorch = toHand(state, a, "scorch");
    const scorchPreview = previewFor(state, a, { type: "play", card: scorch });
    expect(scorchPreview.destroyed.map((c) => c.uid)).toEqual([mine]);
    expect(strength(state, theirs)).toBe(1);
  });

  it("shows as a passive Leader with no usable ability", () => {
    const { state, a } = board();
    expect(viewFor(state, a).you.leader).toEqual({
      cardId: STEADY.id,
      used: false,
      passive: true,
      cancelled: false,
    });
    expect(legalActions(state, a).filter((x) => x.type === "leader")).toEqual([]);
    expect(applyAction(state, a, { type: "leader" }).ok).toBe(false);
    const { state: after } = act(state, a, { type: "pass" });
    expect(after.sides[a].leaderUsed).toBe(false);
  });
});
