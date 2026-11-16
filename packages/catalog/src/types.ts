import type { CardDefinition, CardId, DeckSpec, FactionId } from "@card-duel/engine";

/** Base limits every Valid Deck meets (GLOSSARY.md: Valid Deck). */
export interface ValidDeckLimits {
  minUnits: number;
  maxSpecials: number;
}

/** Extra limits a Competitive Deck meets (GLOSSARY.md: Competitive Deck). Versioned data (ADR-0004). */
export interface CompetitiveDeckLimits {
  maxSpecials: number;
  maxMedics: number;
  maxSpies: number;
  /** Total printed Strength of Unit Cards, Heroes included, Side Deck excluded. */
  maxUnitStrength: number;
}

export interface DeckLimits {
  valid: ValidDeckLimits;
  competitive: CompetitiveDeckLimits;
}

export interface CardStrings {
  name: string;
  /** Short ability text; empty for a plain Unit. */
  text: string;
}

/** Card names and ability text for one language, keyed by card id (ADR-0004). */
export type StringTable = Record<CardId, CardStrings>;

/** One released (or draft) Card Catalog version, as stored in `data/<version>/`. */
export interface CatalogData {
  version: string;
  cards: CardDefinition[];
  starterDecks: Record<FactionId, DeckSpec>;
  limits: DeckLimits;
  strings: Record<string, StringTable>;
}

/** A loaded catalog with lookups. */
export interface Catalog extends CatalogData {
  byId: ReadonlyMap<CardId, CardDefinition>;
}

/** A Deck as saved: possibly incomplete, so the Leader may be missing (GLOSSARY.md: Deck). */
export interface DeckInput {
  faction: FactionId;
  leader: CardId | null;
  cards: CardId[];
}

export interface DeckProblem {
  code:
    | "no_leader"
    | "bad_leader"
    | "unknown_card"
    | "wrong_faction"
    | "too_few_units"
    | "too_many_specials"
    | "too_many_copies"
    | "competitive_specials"
    | "competitive_medics"
    | "competitive_spies"
    | "competitive_strength";
  message: string;
  cardId?: CardId;
}
