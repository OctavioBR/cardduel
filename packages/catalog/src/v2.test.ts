import {
  type Action,
  applyAction,
  createMatch,
  type DeckSpec,
  type FactionId,
  legalActions,
  type MatchState,
  type Seat,
} from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { starterDeckOf } from "./catalog";
import { checkValidDeck } from "./deck-checks";
import { validateCatalog } from "./validate";
import { getCatalog } from "./versions";

const v1 = getCatalog("v1");
const v2 = getCatalog("v2");
const FACTIONS: FactionId[] = ["swarm", "court", "kingdom", "vikings", "elves"];

describe("Card Catalog v2", () => {
  it("passes validation", () => {
    expect(validateCatalog(v2)).toEqual([]);
  });

  it("replaces every v1 Swarm and Court card, so no card id changes meaning", () => {
    for (const card of v1.cards.filter((c) => c.faction !== "neutral")) {
      expect(v2.byId.has(card.id), card.id).toBe(false);
    }
  });

  it("has a Valid Starter Deck for each Faction", () => {
    for (const faction of FACTIONS) {
      const deck = starterDeckOf(v2, faction);
      expect(checkValidDeck(deck, v2), faction).toEqual([]);
    }
  });

  it("makes the 130 total-Strength cap a real constraint for every Faction", () => {
    for (const faction of FACTIONS) {
      const strengths = v2.cards
        .filter(
          (c) =>
            c.kind === "unit" && !c.sideDeck && (c.faction === faction || c.faction === "neutral"),
        )
        .flatMap((c) => (c.kind === "unit" ? Array<number>(c.maxCopies).fill(c.strength) : []))
        .sort((a, b) => b - a);
      const strongest22 = strengths.slice(0, 22).reduce((n, s) => n + s, 0);
      expect(strongest22, faction).toBeGreaterThan(v2.limits.competitive.maxUnitStrength);
    }
  });

  it("gives every Faction five Leaders", () => {
    for (const faction of FACTIONS) {
      const leaders = v2.cards.filter((c) => c.kind === "leader" && c.faction === faction);
      expect(leaders, faction).toHaveLength(5);
    }
  });

  it("assigns distinct artwork to each Seat's Unit copies, including Side Deck forms", () => {
    const berserker = "vikings-young-berserker";
    const bear = "vikings-young-raging-bear";
    const deck = { ...starterDeckOf(v2, "vikings"), cards: Array<string>(3).fill(berserker) };
    const { state } = createMatch({ seed: 42, decks: [deck, deck], cards: v2.cards });
    for (const owner of [0, 1]) {
      for (const cardId of [berserker, bear]) {
        const copies = state.cards.filter((card) => card.owner === owner && card.cardId === cardId);
        expect(copies.map((card) => card.artIndex ?? 0).sort()).toEqual([0, 1, 2]);
      }
    }
  });

  it("refuses Side Deck cards in a Deck", () => {
    const deck = starterDeckOf(v2, "vikings");
    const problems = checkValidDeck({ ...deck, cards: [...deck.cards, "vikings-raging-bear"] }, v2);
    expect(problems).toContainEqual(
      expect.objectContaining({ code: "unknown_card", cardId: "vikings-raging-bear" }),
    );
  });

  it("plays whole Matches between every pair of Starter Decks", () => {
    for (const [i, first] of FACTIONS.entries()) {
      for (const second of FACTIONS.slice(i)) {
        for (let seed = 0; seed < 6; seed++) {
          const decks = [starterDeckOf(v2, first), starterDeckOf(v2, second)] as const;
          expect(playOut(decks, seed), `${first} against ${second}, seed ${seed}`).toBe("ended");
        }
      }
    }
  });

  it("plays whole Matches with every Swarm and Court Leader", () => {
    const leaders = v2.cards.filter(
      (c) => c.kind === "leader" && (c.faction === "swarm" || c.faction === "court"),
    );
    for (const leader of leaders) {
      const own = { ...starterDeckOf(v2, leader.faction as FactionId), leader: leader.id };
      const other = starterDeckOf(v2, leader.faction === "swarm" ? "court" : "swarm");
      for (let seed = 0; seed < 6; seed++) {
        expect(playOut([own, other], seed), `${leader.id}, seed ${seed}`).toBe("ended");
        expect(playOut([other, own], seed), `${leader.id} second, seed ${seed}`).toBe("ended");
      }
    }
  });
});

/** Plays a Match with a fixed spread of legal actions; returns the final phase. */
function playOut(decks: readonly [DeckSpec, DeckSpec], seed: number): MatchState["phase"] {
  let state: MatchState = createMatch({ seed, decks: [...decks], cards: v2.cards }).state;
  for (let step = 0; step < 400 && state.phase !== "ended"; step++) {
    const seat: Seat =
      state.phase === "redraw" ? (state.sides[0].redraw.done ? 1 : 0) : (state.turn as Seat);
    const options = legalActions(state, seat);
    const action = (step % 4 === 3 ? options.at(-1) : options[step % options.length]) as Action;
    const result = applyAction(state, seat, action);
    if (!result.ok) throw new Error(result.rejection.message);
    state = result.state;
  }
  return state.phase;
}
