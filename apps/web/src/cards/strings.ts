import { DEV_PLAIN_CARDS, DEV_PLAIN_NAMES } from "@card-duel/catalog";
import type { CardDefinition } from "@card-duel/engine";

const DEFS = new Map<string, CardDefinition>(DEV_PLAIN_CARDS.map((c) => [c.id, c]));

/** Display name for a card id. Real per-language strings arrive with the catalog package. */
export function cardName(cardId: string): string {
  return DEV_PLAIN_NAMES[cardId] ?? cardId;
}

/** Printed card data, from catalog data shipped with the client (ADR-0004). */
export function cardDef(cardId: string): CardDefinition | undefined {
  return DEFS.get(cardId);
}
