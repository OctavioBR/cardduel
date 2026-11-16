import type { CardDefinition, DeckSpec } from "@card-duel/engine";

/**
 * A hard-coded plain-Unit Deck used until accounts and real Decks exist (Milestone 6).
 * Not part of the Card Catalog.
 */
const PLAIN_UNITS: Array<[id: string, strength: number, row: "close" | "ranged" | "siege"]> = [
  ["plain-pikeman", 2, "close"],
  ["plain-shieldbearer", 4, "close"],
  ["plain-veteran", 6, "close"],
  ["plain-slinger", 3, "ranged"],
  ["plain-archer", 5, "ranged"],
  ["plain-crossbow", 7, "ranged"],
  ["plain-sapper", 1, "siege"],
  ["plain-mangonel", 6, "siege"],
  ["plain-trebuchet", 8, "siege"],
];

export const DEV_PLAIN_LEADER: CardDefinition = {
  id: "plain-captain",
  kind: "leader",
  faction: "swarm",
  maxCopies: 1,
  ability: { type: "clearWeather" },
};

export const DEV_PLAIN_CARDS: CardDefinition[] = [
  DEV_PLAIN_LEADER,
  ...PLAIN_UNITS.map(
    ([id, strength, row]): CardDefinition => ({
      id,
      kind: "unit",
      faction: "neutral",
      strength,
      row,
      hero: false,
      abilities: [],
      maxCopies: 3,
    }),
  ),
];

export const DEV_PLAIN_NAMES: Record<string, string> = {
  "plain-captain": "Captain",
  "plain-pikeman": "Pikeman",
  "plain-shieldbearer": "Shieldbearer",
  "plain-veteran": "Veteran",
  "plain-slinger": "Slinger",
  "plain-archer": "Archer",
  "plain-crossbow": "Crossbow",
  "plain-sapper": "Sapper",
  "plain-mangonel": "Mangonel",
  "plain-trebuchet": "Trebuchet",
};

/** 25 Units: three of each, minus two Trebuchets. */
export function devPlainDeck(faction: DeckSpec["faction"]): DeckSpec {
  const cards = PLAIN_UNITS.flatMap(([id]) => [id, id, id]).slice(0, 25);
  return { faction, leader: DEV_PLAIN_LEADER.id, cards };
}
