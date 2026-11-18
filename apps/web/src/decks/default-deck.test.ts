import { describe, expect, it } from "vitest";
import type { Deck } from "./api";
import { defaultDeck } from "./default-deck";

const problem = { code: "x", message: "Problem." } as unknown as Deck["problems"]["valid"][0];

function deck(id: string, { valid = true, competitive = true } = {}): Deck {
  return {
    id,
    name: id,
    faction: "swarm",
    leader: "leader",
    cards: [],
    updatedAt: 0,
    catalogVersion: "v1",
    problems: { valid: valid ? [] : [problem], competitive: competitive ? [] : [problem] },
  };
}

describe("default Deck", () => {
  // Newest edit first, as the Deck API lists them.
  const decks = [
    deck("draft", { valid: false }),
    deck("casual", { competitive: false }),
    deck("old"),
  ];

  it("is the last used Deck while it can take a Seat", () => {
    expect(defaultDeck(decks, "old")?.id).toBe("old");
  });

  it("else the most recently edited Valid Deck", () => {
    expect(defaultDeck(decks, null)?.id).toBe("casual");
    expect(defaultDeck(decks, "draft")?.id).toBe("casual");
    expect(defaultDeck(decks, "deleted")?.id).toBe("casual");
  });

  it("only a Competitive Deck where one is needed, and none without a Valid Deck", () => {
    expect(defaultDeck(decks, "casual", true)?.id).toBe("old");
    expect(defaultDeck([deck("draft", { valid: false })], null)).toBeNull();
  });
});
