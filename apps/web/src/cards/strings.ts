import {
  CATALOG_VERSIONS,
  type Catalog,
  CURRENT_CATALOG_VERSION,
  cardName as catalogName,
  cardText as catalogText,
  DEV_PLAIN_CARDS,
  DEV_PLAIN_NAMES,
  getCatalog,
} from "@card-duel/catalog";
import type { CardDefinition } from "@card-duel/engine";

/** The catalog version the client shows (ADR-0004). Matches pin theirs on the server. */
export const catalog: Catalog | null = CURRENT_CATALOG_VERSION
  ? getCatalog(CURRENT_CATALOG_VERSION)
  : null;

/**
 * Every catalog version, newest first. A card the shown version no longer has still
 * resolves from the newest version that has it: a Match pinned to an older version, or a
 * dev Local Room built from one.
 */
const VERSIONS = [...CATALOG_VERSIONS].reverse().map((v) => getCatalog(v.version));

function catalogWith(cardId: string): Catalog | null {
  return VERSIONS.find((c) => c.byId.has(cardId)) ?? catalog;
}

const DEFS = new Map<string, CardDefinition>([
  ...DEV_PLAIN_CARDS.map((c): [string, CardDefinition] => [c.id, c]),
  ...[...VERSIONS]
    .reverse()
    .flatMap((v) => v.cards)
    .map((c): [string, CardDefinition] => [c.id, c]),
]);

/** Display name for a card id, from the catalog's string files. */
export function cardName(cardId: string): string {
  if (DEV_PLAIN_NAMES[cardId]) return DEV_PLAIN_NAMES[cardId];
  const source = catalogWith(cardId);
  return source ? catalogName(source, cardId) : cardId;
}

/** Short ability text for a card id. */
export function cardText(cardId: string): string {
  const source = catalogWith(cardId);
  return source ? catalogText(source, cardId) : "";
}

/** Printed card data, from catalog data shipped with the client (ADR-0004). */
export function cardDef(cardId: string): CardDefinition | undefined {
  return DEFS.get(cardId);
}
