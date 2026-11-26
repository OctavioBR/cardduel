import { describe, expect, it } from "vitest";
import type { CardDefinition, LeaderAbility } from "./cards";
import { legalActions } from "./legal";
import { opponent, type Seat } from "./state";
import { computeStrengths } from "./strength";
import {
  act,
  deck,
  place,
  playCard,
  repeat,
  setup,
  startMatch,
  toHand,
  unit,
} from "./testing/fixtures";
import { viewFor } from "./view";

const CARDS = [
  unit("knight", 6, "close"),
  unit("archer", 4, "ranged"),
  unit("hero", 10, "close", { hero: true }),
  unit("spy", 3, "close", { abilities: ["spy"] }),
  unit("hero-spy", 5, "close", { hero: true, abilities: ["spy"] }),
  unit("medic", 1, "siege", { abilities: ["medic"] }),
];
const LIST = [
  ...repeat("knight", 6),
  ...repeat("archer", 6),
  "hero",
  ...repeat("spy", 2),
  "hero-spy",
  ...repeat("medic", 2),
];

function leader(ability: LeaderAbility, id = `leader-${ability.type}`): CardDefinition {
  return { id, kind: "leader", faction: "court", maxCopies: 1, ability };
}

const PLAIN: LeaderAbility = { type: "drawFromDeck" };

/** `a` moves first and has `mine`; `b` has `theirs`. */
function board(mine: LeaderAbility, theirs: LeaderAbility = PLAIN) {
  const leaders = [leader(mine, "leader-a"), leader(theirs, "leader-b")];
  const { state: first } = startMatch(
    setup(
      73,
      [
        { ...deck(LIST, "court"), leader: "leader-a" },
        { ...deck(LIST, "court"), leader: "leader-b" },
      ],
      [...CARDS, ...leaders],
    ),
  );
  // Give the first Seat Leader A whichever Seat won the coin flip.
  const a = first.turn as Seat;
  if (a === 1) {
    first.sides[1].leader = "leader-a";
    first.sides[0].leader = "leader-b";
  }
  return { state: first, a, b: opponent(a) };
}

describe("Discard-to-Draw Leader", () => {
  it("discards 2 chosen hand cards, then draws a chosen card from the deck", () => {
    const { state, a, b } = board({ type: "discardToDrawChosen" });
    const knight = toHand(state, a, "knight");
    const archer = toHand(state, a, "archer");
    const hand = state.sides[a].hand.length;
    let s = act(state, a, { type: "leader" }).state;
    expect(s.pending.map((p) => p.kind)).toEqual(["leaderDiscard", "leaderDiscard", "leaderDraw"]);
    s = act(s, a, { type: "choose", card: knight }).state;
    s = act(s, a, { type: "choose", card: archer }).state;
    expect(s.sides[a].discard).toEqual([knight, archer]);
    const cardId = s.cards[s.sides[a].deck[0] as number]?.cardId as string;
    const { state: done } = act(s, a, { type: "choose", cardId });
    expect(done.sides[a].hand).toHaveLength(hand - 1);
    expect(done.sides[a].deck).toHaveLength(s.sides[a].deck.length - 1);
    expect(done.turn).toBe(b);
  });

  it("needs 2 cards in hand", () => {
    const { state, a } = board({ type: "discardToDrawChosen" });
    state.sides[a].deck.push(...state.sides[a].hand.splice(1));
    expect(legalActions(state, a).some((x) => x.type === "leader")).toBe(false);
  });
});

describe("Take-from-Discard Leader", () => {
  it("takes a non-Hero card from the opponent's Discard Pile, which is then yours", () => {
    const { state, a, b } = board({ type: "takeFromOpponentDiscard" });
    const knight = toHand(state, b, "knight");
    const hero = toHand(state, b, "hero");
    const theirs = state.sides[b];
    theirs.hand = theirs.hand.filter((u) => u !== knight && u !== hero);
    theirs.discard.push(knight, hero);
    const s = act(state, a, { type: "leader" }).state;
    const options = legalActions(s, a);
    expect(options).toEqual([{ type: "choose", card: knight }]);
    const { state: done, events } = act(s, a, { type: "choose", card: knight });
    expect(done.sides[a].hand).toContain(knight);
    expect(done.sides[b].discard).toEqual([hero]);
    expect(done.cards[knight]?.owner).toBe(a);
    expect(events).toContainEqual({
      type: "returnedToHand",
      seat: a,
      card: { uid: knight, cardId: "knight" },
    });
  });

  it("is not usable when only Heroes are there", () => {
    const { state, a, b } = board({ type: "takeFromOpponentDiscard" });
    const hero = toHand(state, b, "hero");
    state.sides[b].hand = state.sides[b].hand.filter((u) => u !== hero);
    state.sides[b].discard.push(hero);
    expect(legalActions(state, a).some((x) => x.type === "leader")).toBe(false);
  });
});

describe("Doubled Spies passive", () => {
  it("doubles every non-Hero Spy on the battlefield, on both sides", () => {
    const { state, a, b } = board({ type: "passive", passive: "doubledSpies" });
    const spyA = place(state, a, "spy", "close");
    const spyB = place(state, b, "spy", "close");
    const heroSpy = place(state, b, "hero-spy", "close");
    const knight = place(state, b, "knight", "close");
    const strengths = computeStrengths(state);
    expect(strengths.get(spyA)).toBe(6);
    expect(strengths.get(spyB)).toBe(6);
    expect(strengths.get(heroSpy)).toBe(5);
    expect(strengths.get(knight)).toBe(6);
  });
});

describe("Random Medic passive", () => {
  it("makes either player's Medic Play a random non-Hero Unit at once", () => {
    const { state, b } = board({ type: "passive", passive: "randomMedic" });
    const knight = toHand(state, b, "knight");
    const archer = toHand(state, b, "archer");
    const side = state.sides[b];
    side.hand = side.hand.filter((u) => u !== knight && u !== archer);
    side.discard.push(knight, archer);
    toHand(state, b, "medic");
    state.turn = b;
    const { state: after, events } = playCard(state, b, "medic");
    expect(after.pending).toEqual([]);
    const played = events.filter((e) => e.type === "cardPlayed" && e.via === "medic");
    expect(played).toHaveLength(1);
    expect(after.sides[b].discard).toHaveLength(1);
  });
});

describe("Cancel Opponent Leader passive", () => {
  it("takes the opponent's Leader ability away", () => {
    const { state, a, b } = board({ type: "passive", passive: "cancelOpponentLeader" });
    state.turn = b;
    expect(legalActions(state, b).some((x) => x.type === "leader")).toBe(false);
    expect(viewFor(state, b).you.leader).toMatchObject({ cancelled: true, passive: false });
    expect(viewFor(state, a).you.leader).toMatchObject({ cancelled: false, passive: true });
  });

  it("switches off the opponent's passive too", () => {
    const { state, a, b } = board(
      { type: "passive", passive: "cancelOpponentLeader" },
      { type: "passive", passive: "doubledSpies" },
    );
    const spy = place(state, a, "spy", "close");
    expect(computeStrengths(state).get(spy)).toBe(3);
    expect(viewFor(state, b).you.leader.cancelled).toBe(true);
  });

  it("leaves another Cancel Opponent Leader be", () => {
    const passive: LeaderAbility = { type: "passive", passive: "cancelOpponentLeader" };
    const { state, a, b } = board(passive, passive);
    expect(viewFor(state, a).you.leader.cancelled).toBe(false);
    expect(viewFor(state, b).you.leader.cancelled).toBe(false);
  });
});
