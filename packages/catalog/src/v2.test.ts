import {
  type Action,
  applyAction,
  createMatch,
  type FactionId,
  legalActions,
  type MatchState,
  type Seat,
} from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { starterDeckOf } from "./catalog";
import { checkCompetitiveDeck, checkValidDeck } from "./deck-checks";
import { validateCatalog } from "./validate";
import { getCatalog } from "./versions";

const v1 = getCatalog("v1");
const v2 = getCatalog("v2");
const FACTIONS: FactionId[] = ["swarm", "court", "kingdom", "vikings", "elves"];

describe("Card Catalog v2", () => {
  it("passes validation", () => {
    expect(validateCatalog(v2)).toEqual([]);
  });

  it("keeps every Swarm and Court card and Starter Deck exactly as in v1", () => {
    for (const card of v1.cards.filter((c) => c.faction !== "neutral")) {
      expect(v2.byId.get(card.id), card.id).toEqual(card);
      expect(v2.strings.en?.[card.id], card.id).toEqual(v1.strings.en?.[card.id]);
    }
    expect(v2.starterDecks.swarm).toEqual(v1.starterDecks.swarm);
    expect(v2.starterDecks.court).toEqual(v1.starterDecks.court);
  });

  it("has a Competitive Starter Deck for each of the four Factions", () => {
    for (const faction of FACTIONS) {
      const deck = starterDeckOf(v2, faction);
      expect(checkValidDeck(deck, v2), faction).toEqual([]);
      expect(checkCompetitiveDeck(deck, v2), faction).toEqual([]);
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

  it("gives Kingdom, Vikings and Elves five Leaders each", () => {
    const leaders = (faction: string) =>
      v2.cards.filter((c) => c.kind === "leader" && c.faction === faction);
    expect(leaders("kingdom")).toHaveLength(5);
    expect(leaders("vikings")).toHaveLength(5);
    expect(leaders("elves")).toHaveLength(5);
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
          let state: MatchState = createMatch({
            seed,
            decks: [starterDeckOf(v2, first), starterDeckOf(v2, second)],
            cards: v2.cards,
          }).state;
          for (let step = 0; step < 400 && state.phase !== "ended"; step++) {
            const seat: Seat =
              state.phase === "redraw"
                ? state.sides[0].redraw.done
                  ? 1
                  : 0
                : (state.turn as Seat);
            const options = legalActions(state, seat);
            const action = (
              step % 4 === 3 ? options.at(-1) : options[step % options.length]
            ) as Action;
            const result = applyAction(state, seat, action);
            if (!result.ok) throw new Error(result.rejection.message);
            state = result.state;
          }
          expect(state.phase, `${first} against ${second}, seed ${seed}`).toBe("ended");
        }
      }
    }
  });
});
