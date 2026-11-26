/**
 * The engine owns the card definition type; the catalog package validates its data
 * against it (ADR-0004). Names and ability text are not here: they live in per-language
 * string files keyed by card id.
 */
export type CardId = string;

export type FactionId = "swarm" | "court" | "kingdom" | "vikings" | "elves";
export type CardFaction = FactionId | "neutral";

export const ROWS = ["close", "ranged", "siege"] as const;
export type RowId = (typeof ROWS)[number];

/** On-play and ongoing abilities a Unit Card can carry. */
export type UnitAbility =
  | "agile"
  | "horn"
  | "medic"
  | "moraleBoost"
  | "muster"
  | "tightBond"
  /** On-play Scorch of the opponent's Row matching the Row it was Played to (Catalog v1). */
  | "scorch"
  | "spy"
  /** On-play Scorch of the opponent's whole side, when their Score is 10 or more. */
  | "sideScorch"
  /** On-play Scorch of the whole battlefield, like the Scorch Special Card. */
  | "battlefieldScorch"
  /** When discarded from the battlefield, its Side Deck card takes its place (`summons`). */
  | "summon"
  /** Frenzy turns it into its Side Deck form (`transformsInto`). */
  | "berserker"
  /** On-play Frenzy: every Berserker its player controls turns into its Side Deck form. */
  | "frenzy";

export type SpecialEffect =
  | { type: "weather"; rows: RowId[] }
  | { type: "clearWeather" }
  | { type: "horn" }
  | { type: "decoy" }
  | { type: "scorch" }
  | { type: "frenzy" };

/** Leader ability kinds. Each Leader card carries exactly one. */
export type LeaderAbility =
  | { type: "playWeatherFromDeck" }
  /** Plays this Special Card from the deck at once (Weather, Clear Weather, Scorch or Frenzy). */
  | { type: "playCardFromDeck"; card: CardId }
  | { type: "clearWeather" }
  /** Horns a Row of the player's choice, or only `row` when set. */
  | { type: "hornRow"; row?: RowId }
  | { type: "scorchRow"; row: RowId }
  | { type: "returnFromDiscard" }
  | { type: "drawChosenFromDeck" }
  /** Discards 2 cards of the player's choice from the hand, then draws a card of their choice from the deck. */
  | { type: "discardToDrawChosen" }
  /** Takes a non-Hero card of the player's choice from the opponent's Discard Pile into the hand. */
  | { type: "takeFromOpponentDiscard" }
  | { type: "lookAtOpponentHand" }
  /** Plays, from the deck, a copy of a Tight Bond Unit the player has on the battlefield. */
  | { type: "playBondCopyFromDeck" }
  /** Each player's Discard Pile is shuffled back into their deck. */
  | { type: "shuffleDiscardsIntoDecks" }
  /** Moves each of the player's Agile Units to the Row where its Strength is higher. */
  | { type: "moveAgileUnits" }
  /** Draws the top card of the player's deck. */
  | { type: "drawFromDeck" }
  | { type: "passive"; passive: PassiveLeaderKind };

/**
 * Passive Leader kinds. Steady Ground (#29): Weather never lowers Units on the Leader's
 * Controller's Siege Row. Storm-Hardened: Weather lowers the Controller's Units to half their
 * printed Strength (rounded up), not to 1. The rest act on both players: Doubled Spies doubles
 * every non-Hero Spy on the battlefield; Random Medic makes every Medic Play a random non-Hero
 * Unit; Cancel Opponent Leader takes the opponent's Leader ability away.
 */
export type PassiveLeaderKind =
  | "steadyGround"
  | "stormHardened"
  | "doubledSpies"
  | "randomMedic"
  | "cancelOpponentLeader";

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
  /** Other illustrations of the same Unit, in addition to its primary image. */
  alternateImages?: string[];
  strength: number;
  /** The Row the Unit is played to. Agile Units carry the "agile" ability and may also use Ranged. */
  row: RowId;
  hero: boolean;
  abilities: UnitAbility[];
  /** The Muster group the card belongs to; Muster Plays every member (Muster). */
  musterGroup?: string;
  /**
   * The Muster group this card's Muster Plays, when it is not the card's own group: a Hero
   * that calls its companion without being called back.
   */
  musterCalls?: string;
  /** The Side Deck card a Summon card is replaced by. */
  summons?: CardId;
  /** The Side Deck card a Berserker turns into. */
  transformsInto?: CardId;
  /** A Side Deck card: it never goes in a Deck and only enters by Summon or Frenzy. */
  sideDeck?: boolean;
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
