import type { CardDefinition, DeckSpec, FactionId } from "@card-duel/engine";
import cards from "../../data/v2/cards.json";
import limits from "../../data/v2/limits.json";
import starterDecks from "../../data/v2/starter-decks.json";
import en from "../../data/v2/strings/en.json";
import type { CatalogData, DeckLimits, StringTable } from "../types";

/**
 * Card Catalog v2 (data in `data/v2/`): Swarm and Court as in v1, the Kingdom, Vikings and
 * Elves Factions, and a new set of Neutral Cards with Summon and the Side Deck.
 */
export const V2: CatalogData = {
  version: "v2",
  cards: cards as CardDefinition[],
  starterDecks: starterDecks as Partial<Record<FactionId, DeckSpec>>,
  limits: limits as DeckLimits,
  strings: { en: en as StringTable },
};
