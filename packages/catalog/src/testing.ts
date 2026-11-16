import type { CardDefinition, FactionId } from "@card-duel/engine";
import type { CatalogData } from "./types";

const FACTIONS: FactionId[] = ["swarm", "court"];

/**
 * A small, valid fixture catalog for tests: per Faction, Units of Strength 1 to 8, a Medic,
 * a Spy, a Hero and a Leader; Neutral Weather, Horn and Decoy. Starter Decks hold three of
 * each Unit 1 to 7 and one Unit 8: 22 Units, total Strength 92.
 */
export function fixtureCatalog(): CatalogData {
  const cards: CardDefinition[] = [];
  for (const faction of FACTIONS) {
    for (let n = 1; n <= 8; n++) cards.push(unit(`${faction}-unit-${n}`, faction, n));
    cards.push(unit(`${faction}-medic`, faction, 1, { abilities: ["medic"] }));
    cards.push(unit(`${faction}-spy`, faction, 2, { abilities: ["spy"] }));
    cards.push(unit(`${faction}-hero`, faction, 15, { hero: true, maxCopies: 1 }));
    cards.push({
      id: `${faction}-leader`,
      kind: "leader",
      faction,
      maxCopies: 1,
      ability: { type: "clearWeather" },
    });
  }
  cards.push(
    {
      id: "frost",
      kind: "special",
      faction: "neutral",
      maxCopies: 3,
      effect: { type: "weather", rows: ["close"] },
    },
    { id: "horn", kind: "special", faction: "neutral", maxCopies: 3, effect: { type: "horn" } },
    { id: "decoy", kind: "special", faction: "neutral", maxCopies: 3, effect: { type: "decoy" } },
  );
  const starter = (faction: FactionId) => ({
    faction,
    leader: `${faction}-leader`,
    cards: [
      ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => Array(3).fill(`${faction}-unit-${n}`) as string[]),
      `${faction}-unit-8`,
    ],
  });
  return {
    version: "fixture",
    cards,
    starterDecks: { swarm: starter("swarm"), court: starter("court") },
    limits: {
      valid: { minUnits: 22, maxSpecials: 10 },
      competitive: { maxSpecials: 5, maxMedics: 2, maxSpies: 2, maxUnitStrength: 130 },
    },
    strings: {
      en: Object.fromEntries(cards.map((c) => [c.id, { name: `Name of ${c.id}`, text: "" }])),
    },
  };
}

function unit(
  id: string,
  faction: CardDefinition["faction"],
  strength: number,
  extra: Partial<Extract<CardDefinition, { kind: "unit" }>> = {},
): CardDefinition {
  return {
    id,
    kind: "unit",
    faction,
    strength,
    row: "close",
    hero: false,
    abilities: [],
    maxCopies: 3,
    ...extra,
  };
}
