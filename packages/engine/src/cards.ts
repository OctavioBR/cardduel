/**
 * The engine owns the card definition type; the catalog package validates its data
 * against it (ADR-0004). Names and ability text are not here: they live in per-language
 * string files keyed by card id.
 */
export type CardId = string;

export type FactionId = "swarm" | "court";
export type CardFaction = FactionId | "neutral";

export const ROWS = ["close", "ranged", "siege"] as const;
export type RowId = (typeof ROWS)[number];

/** On-play and ongoing abilities a Unit Card can carry in v1. */
export type UnitAbility =
  | "agile"
  | "horn"
  | "medic"
  | "moraleBoost"
  | "muster"
  | "tightBond"
  | "scorch"
  | "spy";

export type SpecialEffect =
  | { type: "weather"; rows: RowId[] }
  | { type: "clearWeather" }
  | { type: "horn" }
  | { type: "decoy" }
  | { type: "scorch" };

/** Leader ability kinds. Each Leader card carries exactly one. */
export type LeaderAbility =
  | { type: "playWeatherFromDeck" }
  | { type: "clearWeather" }
  | { type: "hornRow" }
  | { type: "scorchRow"; row: RowId }
  | { type: "returnFromDiscard" }
  | { type: "drawChosenFromDeck" }
  | { type: "lookAtOpponentHand" }
  | { type: "passive"; passive: PassiveLeaderKind };

/** Passive Leader kinds approved in the card set review (#29). None are approved yet. */
export type PassiveLeaderKind = never;

interface CardBase {
  id: CardId;
  faction: CardFaction;
  /** Maximum copies of this card in one Deck. */
  maxCopies: number;
  /** Optional image path, relative to the client's static card image directory. */
  image?: string;
}

export interface UnitDefinition extends CardBase {
  kind: "unit";
  strength: number;
  /** The Row the Unit is played to. Agile Units carry the "agile" ability and may also use Ranged. */
  row: RowId;
  hero: boolean;
  abilities: UnitAbility[];
  /** Cards sharing a Muster group are Played together (Muster). */
  musterGroup?: string;
}

export interface SpecialDefinition extends CardBase {
  kind: "special";
  effect: SpecialEffect;
}

export interface LeaderDefinition extends CardBase {
  kind: "leader";
  ability: LeaderAbility;
}

export type CardDefinition = UnitDefinition | SpecialDefinition | LeaderDefinition;

export function isUnit(def: CardDefinition): def is UnitDefinition {
  return def.kind === "unit";
}

export function hasAbility(def: CardDefinition, ability: UnitAbility): boolean {
  return def.kind === "unit" && def.abilities.includes(ability);
}
