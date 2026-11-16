import type { CardDefinition } from "@card-duel/engine";
import type { Catalog, CatalogData } from "./types";

export function loadCatalog(data: CatalogData): Catalog {
  return {
    ...data,
    byId: new Map(data.cards.map((card): [string, CardDefinition] => [card.id, card])),
  };
}

/** Display name of a card in a language, falling back to English, then the id. */
export function cardName(catalog: CatalogData, cardId: string, lang = "en"): string {
  return catalog.strings[lang]?.[cardId]?.name ?? catalog.strings.en?.[cardId]?.name ?? cardId;
}

export function cardText(catalog: CatalogData, cardId: string, lang = "en"): string {
  return catalog.strings[lang]?.[cardId]?.text ?? catalog.strings.en?.[cardId]?.text ?? "";
}

/**
 * A short, stable fingerprint of a catalog version's content (FNV-1a over canonical JSON).
 * Used to prove a released version is never edited in place; not a security hash.
 */
export function fingerprint(data: CatalogData): string {
  const text = canonicalJson(data);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
