import type { CardDefinition, CardId, FactionId, RowId } from "./cards";

export type Seat = 0 | 1;
export const SEATS: readonly Seat[] = [0, 1];

export function opponent(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

/** Index into `MatchState.cards`. Stable for the whole Match. */
export type Uid = number;

export interface CardInstance {
  cardId: CardId;
  /** The Seat whose Deck the card came from. A Spy's Controller can differ. */
  owner: Seat;
}

export interface RowState {
  /** Cards in the Row: Units, plus a Decoy standing in for one. */
  units: Uid[];
  /** A Horn Special Card sitting in this Row's Horn slot. */
  horn: Uid | null;
  /** The Horn slot is taken by a Leader's Horn ability. */
  leaderHorn: boolean;
}

export interface SideState {
  faction: FactionId;
  leader: CardId;
  leaderUsed: boolean;
  /** Ordered: index 0 is the top of the deck. Hidden from both views. */
  deck: Uid[];
  /**
   * Side Deck cards waiting to enter by Summon or Frenzy (GLOSSARY.md: Side Deck), and the
   * Berserkers they replaced. Hidden from both views.
   */
  sideDeck: Uid[];
  hand: Uid[];
  discard: Uid[];
  rows: Record<RowId, RowState>;
  gems: number;
  passed: boolean;
  /** Cards in the opponent's hand this Seat has seen (a "look at 3" Leader). */
  known: Uid[];
  /** Redraw progress: cards returned so far, and whether the Seat has confirmed. */
  redraw: { returned: number; done: boolean };
}

export type MatchResult =
  | { outcome: "win"; winner: Seat; reason: "gems" | "forfeit" | "disconnect" }
  | { outcome: "draw" };

export type Phase = "redraw" | "turns" | "ended";

export type PendingKind =
  | "medic"
  | "leaderWeather"
  | "leaderReturn"
  | "leaderDraw"
  | "leaderBond"
  /** Elves chooses who takes the first Turn of the Match. */
  | "firstTurn";

/**
 * A decision a Seat must make after a play has resolved (GLOSSARY.md: Pending Choice).
 * Its options are computed from the current state when it becomes active.
 */
export interface PendingChoice {
  seat: Seat;
  kind: PendingKind;
}

/**
 * Shape version of `MatchState`. A Room rebuilds a snapshot of another version from the
 * seed and action log (ADR-0003).
 */
export const MATCH_STATE_VERSION = 2;

/** Plain JSON data: the Room snapshots it (ADR-0003). */
export interface MatchState {
  version: typeof MATCH_STATE_VERSION;
  /** Seeded generator state. */
  rng: number;
  /** Definitions of every card in either Deck, copied in at Match creation (ADR-0004). */
  defs: Record<CardId, CardDefinition>;
  cards: CardInstance[];
  sides: [SideState, SideState];
  /** Shared Weather zone. */
  weather: Uid[];
  phase: Phase;
  round: number;
  /** The Seat that took the first Turn of the current Round. */
  roundStarter: Seat;
  /** Pending Choices waiting to be made; the first is active. */
  pending: PendingChoice[];
  /** The Seat to move, or null when nobody can act (Match over). */
  turn: Seat | null;
  /** Number of accepted actions. Clients echo it so the Room can reject stale actions. */
  actionCount: number;
  result: MatchResult | null;
}

export interface DeckSpec {
  faction: FactionId;
  leader: CardId;
  cards: CardId[];
}

export interface MatchSetup {
  seed: number;
  decks: [DeckSpec, DeckSpec];
  /** Definitions for every card id in both Decks, Leaders included. */
  cards: CardDefinition[];
}
