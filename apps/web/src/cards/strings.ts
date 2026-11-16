import {
  type CatalogData,
  CURRENT_CATALOG_VERSION,
  cardName as catalogName,
  cardText as catalogText,
  DEV_PLAIN_CARDS,
  DEV_PLAIN_NAMES,
  getCatalog,
} from "@card-duel/catalog";
import type { CardDefinition } from "@card-duel/engine";

/** The catalog version the client shows (ADR-0004). Matches pin theirs on the server. */
export const catalog: CatalogData | null = CURRENT_CATALOG_VERSION
  ? getCatalog(CURRENT_CATALOG_VERSION)
  : null;

const DEFS = new Map<string, CardDefinition>([
  ...DEV_PLAIN_CARDS.map((c): [string, CardDefinition] => [c.id, c]),
  ...(catalog?.cards ?? []).map((c): [string, CardDefinition] => [c.id, c]),
]);

/** Display name for a card id, from the catalog's string files. */
export function cardName(cardId: string): string {
  if (DEV_PLAIN_NAMES[cardId]) return DEV_PLAIN_NAMES[cardId];
  return catalog ? catalogName(catalog, cardId) : cardId;
}

/** Short ability text for a card id. */
export function cardText(cardId: string): string {
  return catalog ? catalogText(catalog, cardId) : "";
}

/** Printed card data, from catalog data shipped with the client (ADR-0004). */
export function cardDef(cardId: string): CardDefinition | undefined {
  return DEFS.get(cardId);
}
