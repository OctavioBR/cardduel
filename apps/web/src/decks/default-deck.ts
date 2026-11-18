import type { Deck } from "./api";

/** Decks that can take a Seat: Valid Decks, and only Competitive Decks when `competitive`. */
export function seatableDecks(decks: readonly Deck[], competitive = false): Deck[] {
  return decks.filter(
    (d) => d.problems.valid.length === 0 && (!competitive || d.problems.competitive.length === 0),
  );
}

/**
 * The Deck selected by default (#108): the last used Deck if it can still take a Seat, else
 * the most recently edited one. `decks` comes newest edit first, as the Deck API lists them.
 */
export function defaultDeck(
  decks: readonly Deck[],
  lastDeckId: string | null,
  competitive = false,
): Deck | null {
  const choices = seatableDecks(decks, competitive);
  return choices.find((d) => d.id === lastDeckId) ?? choices[0] ?? null;
}
