import { describe, expect, it } from "vitest";
import { DEV_PLAIN_CARDS, DEV_PLAIN_NAMES, devPlainDeck } from "./index";

describe("dev plain Deck", () => {
  it("names every card and uses only defined cards", () => {
    const ids = new Set(DEV_PLAIN_CARDS.map((c) => c.id));
    for (const card of DEV_PLAIN_CARDS) expect(DEV_PLAIN_NAMES[card.id]).toBeTruthy();
    const deck = devPlainDeck("swarm");
    expect(deck.cards).toHaveLength(25);
    for (const id of [deck.leader, ...deck.cards]) expect(ids.has(id)).toBe(true);
  });
});
