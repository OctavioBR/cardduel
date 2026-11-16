import type { CardDefinition, LeaderAbility } from "../cards";
import type { DeckSpec, MatchSetup } from "../state";
import { repeat, special, unit } from "./fixtures";

/** Fixture cards covering every v1 ability, for random-Match property tests and benchmarks. */
export const RICH_CARDS: CardDefinition[] = [
  unit("knight", 6, "close"),
  unit("archer", 4, "ranged"),
  unit("ram", 8, "siege"),
  unit("hero", 10, "close", { hero: true }),
  unit("sage", 7, "ranged", { hero: true, abilities: ["medic"] }),
  unit("skirmisher", 4, "close", { abilities: ["agile"] }),
  unit("bond", 4, "close", { abilities: ["tightBond"] }),
  unit("drummer", 2, "ranged", { abilities: ["moraleBoost"] }),
  unit("bugler", 3, "siege", { abilities: ["horn"] }),
  unit("medic", 2, "siege", { abilities: ["medic"] }),
  unit("spy", 3, "ranged", { abilities: ["spy"] }),
  unit("torch", 5, "close", { abilities: ["scorch"] }),
  unit("wasp", 2, "close", { abilities: ["muster"], musterGroup: "hive" }),
  unit("drone", 3, "ranged", { abilities: ["muster", "medic"], musterGroup: "hive" }),
  special("frost", { type: "weather", rows: ["close"] }),
  special("storm", { type: "weather", rows: ["ranged", "siege"] }),
  special("sun", { type: "clearWeather" }),
  special("horn", { type: "horn" }),
  special("decoy", { type: "decoy" }),
  special("scorch", { type: "scorch" }),
];

export const RICH_LIST: string[] = [
  ...repeat("knight", 2),
  "archer",
  "ram",
  "hero",
  "sage",
  ...repeat("skirmisher", 2),
  ...repeat("bond", 3),
  "drummer",
  "bugler",
  ...repeat("medic", 2),
  ...repeat("spy", 2),
  "torch",
  ...repeat("wasp", 3),
  "drone",
  "frost",
  "storm",
  "sun",
  "horn",
  ...repeat("decoy", 2),
  "scorch",
];

export const RICH_LEADER_ABILITIES: LeaderAbility[] = [
  { type: "playWeatherFromDeck" },
  { type: "clearWeather" },
  { type: "hornRow" },
  { type: "scorchRow", row: "close" },
  { type: "returnFromDiscard" },
  { type: "drawChosenFromDeck" },
  { type: "lookAtOpponentHand" },
];

export const RICH_LEADERS: CardDefinition[] = RICH_LEADER_ABILITIES.map((ability) => ({
  id: `leader-${ability.type}`,
  kind: "leader",
  faction: "swarm",
  maxCopies: 1,
  ability,
}));

/** A rich Match: Leaders and Factions vary with the seed. */
export function richSetup(seed: number): MatchSetup {
  const leaderA = RICH_LEADERS[seed % RICH_LEADERS.length] as CardDefinition;
  const leaderB = RICH_LEADERS[(seed + 3) % RICH_LEADERS.length] as CardDefinition;
  const decks: [DeckSpec, DeckSpec] = [
    { faction: seed % 2 === 0 ? "swarm" : "court", leader: leaderA.id, cards: RICH_LIST },
    { faction: seed % 3 === 0 ? "swarm" : "court", leader: leaderB.id, cards: RICH_LIST },
  ];
  return { seed, decks, cards: [...RICH_CARDS, ...RICH_LEADERS] };
}
