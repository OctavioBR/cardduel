import type { CardDefinition, DeckSpec, FactionId } from "@card-duel/engine";
import cards from "../../data/v1/cards.json";
import limits from "../../data/v1/limits.json";
import starterDecks from "../../data/v1/starter-decks.json";
import en from "../../data/v1/strings/en.json";
import type { CatalogData, DeckLimits, StringTable } from "../types";

/** Card Catalog v1: Swarm, Court and Neutral Cards (data in `data/v1/`). */
export const V1: CatalogData = {
  version: "v1",
  cards: cards as CardDefinition[],
  starterDecks: starterDecks as Record<FactionId, DeckSpec>,
  limits: limits as DeckLimits,
  strings: { en: en as StringTable },
};
