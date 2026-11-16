import { describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog";
import { checkCompetitiveDeck, checkValidDeck, isCompetitiveDeck } from "./deck-checks";
import { fixtureCatalog } from "./testing";
import type { DeckInput } from "./types";

const catalog = loadCatalog(fixtureCatalog());
const starter = (): DeckInput => ({
  ...catalog.starterDecks.swarm,
  cards: [...catalog.starterDecks.swarm.cards],
});
const codes = (problems: { code: string }[]) => problems.map((p) => p.code);

describe("checkValidDeck", () => {
  it("accepts a Valid Deck", () => {
    expect(checkValidDeck(starter(), catalog)).toEqual([]);
  });

  it("needs exactly one Leader, of the Deck's Faction", () => {
    expect(codes(checkValidDeck({ ...starter(), leader: null }, catalog))).toEqual(["no_leader"]);
    expect(codes(checkValidDeck({ ...starter(), leader: "court-leader" }, catalog))).toEqual([
      "bad_leader",
    ]);
    expect(codes(checkValidDeck({ ...starter(), leader: "swarm-unit-1" }, catalog))).toEqual([
      "bad_leader",
    ]);
  });

  it("needs at least 22 Unit Cards", () => {
    const deck = starter();
    deck.cards.pop();
    const problems = checkValidDeck(deck, catalog);
    expect(codes(problems)).toEqual(["too_few_units"]);
    expect(problems[0]?.message).toBe("A Deck needs at least 22 Unit Cards (has 21).");
  });

  it("allows at most 10 Special Cards", () => {
    const deck = starter();
    deck.cards.push(...Array(3).fill("frost"), ...Array(3).fill("horn"), ...Array(3).fill("decoy"));
    expect(checkValidDeck(deck, catalog)).toEqual([]);
    deck.cards.push("swarm-medic");
    expect(checkValidDeck(deck, catalog)).toEqual([]);
    const over = { ...deck, cards: [...deck.cards, ...Array(2).fill("frost")] };
    expect(codes(checkValidDeck(over, catalog))).toContain("too_many_specials");
  });

  it("allows no card beyond its copy limit", () => {
    const deck = starter();
    deck.cards.push("swarm-unit-1");
    const problems = checkValidDeck(deck, catalog);
    expect(problems).toEqual([
      {
        code: "too_many_copies",
        message: "Too many copies of Name of swarm-unit-1: 4 (at most 3).",
        cardId: "swarm-unit-1",
      },
    ]);
    deck.cards.push("swarm-hero", "swarm-hero");
    expect(codes(checkValidDeck(deck, catalog))).toContain("too_many_copies");
  });

  it("allows only cards of its Faction or Neutral Cards", () => {
    const deck = starter();
    deck.cards.push("court-unit-1", "frost");
    expect(codes(checkValidDeck(deck, catalog))).toEqual(["wrong_faction"]);
  });

  it("reports unknown cards and Leaders listed as cards", () => {
    const deck = starter();
    deck.cards.push("retired-card", "swarm-leader");
    expect(codes(checkValidDeck(deck, catalog))).toEqual(["unknown_card", "unknown_card"]);
  });

  it("an incomplete Deck lists every problem", () => {
    const problems = checkValidDeck(
      { faction: "court", leader: null, cards: ["swarm-unit-1"] },
      catalog,
    );
    expect(codes(problems)).toEqual(["no_leader", "wrong_faction", "too_few_units"]);
  });
});

describe("checkCompetitiveDeck", () => {
  it("a Starter Deck is a Competitive Deck", () => {
    expect(checkCompetitiveDeck(starter(), catalog)).toEqual([]);
    expect(isCompetitiveDeck(starter(), catalog)).toBe(true);
  });

  it("allows at most 5 Special Cards", () => {
    const deck = starter();
    deck.cards.push(...Array(3).fill("frost"), ...Array(2).fill("horn"));
    expect(checkCompetitiveDeck(deck, catalog)).toEqual([]);
    deck.cards.push("decoy");
    expect(codes(checkCompetitiveDeck(deck, catalog))).toEqual(["competitive_specials"]);
    expect(isCompetitiveDeck(deck, catalog)).toBe(false);
  });

  it("allows at most 2 Medics and 2 Spies, Heroes included", () => {
    const deck = starter();
    deck.cards.push("swarm-medic", "swarm-medic", "swarm-spy", "swarm-spy");
    expect(checkCompetitiveDeck(deck, catalog)).toEqual([]);
    deck.cards.push("swarm-medic", "swarm-spy");
    expect(codes(checkCompetitiveDeck(deck, catalog))).toEqual([
      "competitive_medics",
      "competitive_spies",
    ]);
  });

  it("caps total printed Unit Strength at 130, Heroes included", () => {
    const deck = starter(); // 92
    deck.cards.push("swarm-unit-8", "swarm-unit-8", "swarm-hero"); // 92 + 16 + 15 = 123
    expect(checkCompetitiveDeck(deck, catalog)).toEqual([]);
    // Competitive checks only add up Strength; copy limits are the Valid Deck check's job.
    deck.cards.push("swarm-unit-7", "swarm-medic"); // 123 + 7 + 1 = 131
    const problems = checkCompetitiveDeck(deck, catalog);
    expect(codes(problems)).toEqual(["competitive_strength"]);
    expect(problems[0]?.message).toBe(
      "Competitive Decks have at most 130 total Unit Strength (has 131).",
    );
  });

  it("uses the limits from the catalog version's data", () => {
    const strict = loadCatalog({
      ...fixtureCatalog(),
      limits: {
        ...catalog.limits,
        competitive: { ...catalog.limits.competitive, maxUnitStrength: 90 },
      },
    });
    expect(codes(checkCompetitiveDeck(starter(), strict))).toEqual(["competitive_strength"]);
  });
});
