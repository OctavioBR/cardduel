import type { CardDefinition, FactionId, RowId, UnitAbility } from "@card-duel/engine";
import { cardName } from "../cards/strings";
import copy from "../strings/en.json";

export type TypeFilter = "all" | "unit" | "hero" | "special";
export type RowFilter = "all" | RowId;
export type AbilityFilter = "all" | UnitAbility;

export interface PoolFilters {
  row: RowFilter;
  type: TypeFilter;
  ability: AbilityFilter;
}

/**
 * Deck builder order: Units by Strength, highest first, then by name; Special Cards after
 * every Unit, by name.
 */
export function compareCards(a: CardDefinition, b: CardDefinition): number {
  const rank = (c: CardDefinition) => (c.kind === "unit" ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const sa = a.kind === "unit" ? a.strength : 0;
  const sb = b.kind === "unit" ? b.strength : 0;
  if (sa !== sb) return sb - sa;
  return cardName(a.id).localeCompare(cardName(b.id));
}

/**
 * The pool for a Faction: its cards plus Neutral Cards (no Leaders, no Side Deck cards),
 * filtered and sorted.
 */
export function poolCards(
  cards: CardDefinition[],
  faction: FactionId,
  filters: PoolFilters,
): CardDefinition[] {
  return cards
    .filter((c) => c.kind !== "leader" && (c.faction === faction || c.faction === "neutral"))
    .filter((c) => !(c.kind === "unit" && c.sideDeck))
    .filter((c) => {
      if (filters.type === "special" && c.kind !== "special") return false;
      if (filters.type === "unit" && !(c.kind === "unit" && !c.hero)) return false;
      if (filters.type === "hero" && !(c.kind === "unit" && c.hero)) return false;
      if (filters.row !== "all") {
        if (c.kind !== "unit") return false;
        const rows = c.abilities.includes("agile") ? ["close", "ranged"] : [c.row];
        if (!rows.includes(filters.row)) return false;
      }
      if (
        filters.ability !== "all" &&
        !(c.kind === "unit" && c.abilities.includes(filters.ability))
      )
        return false;
      return true;
    })
    .sort(compareCards);
}

/** Copies of each card id in a card list. */
export function countCopies(cards: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export interface DeckCounters {
  units: number;
  specials: number;
  strength: number;
  heroes: number;
}

export function deckCounters(
  cards: string[],
  lookup: (id: string) => CardDefinition | undefined,
): DeckCounters {
  const out = { units: 0, specials: 0, strength: 0, heroes: 0 };
  for (const id of cards) {
    const def = lookup(id);
    if (def?.kind === "unit") {
      out.units++;
      out.strength += def.strength;
      if (def.hero) out.heroes++;
    } else if (def?.kind === "special") out.specials++;
  }
  return out;
}

/** The Deck grouped by Row (Special Cards last), each group in builder order. */
export function deckGroups(
  cards: string[],
  lookup: (id: string) => CardDefinition | undefined,
): { key: string; label: string; entries: { def: CardDefinition; count: number }[] }[] {
  const counts = countCopies(cards);
  const defs = [...counts.keys()]
    .map(lookup)
    .filter((d): d is CardDefinition => !!d)
    .sort(compareCards);
  const groups = [
    { key: "close", label: copy.close },
    { key: "ranged", label: copy.ranged },
    { key: "siege", label: copy.siege },
    { key: "special", label: copy.specialCards },
  ];
  return groups
    .map((g) => ({
      ...g,
      entries: defs
        .filter((d) => (d.kind === "unit" ? d.row === g.key : g.key === "special"))
        .map((def) => ({ def, count: counts.get(def.id) ?? 0 })),
    }))
    .filter((g) => g.entries.length > 0);
}
