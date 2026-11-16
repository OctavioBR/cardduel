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
  units: Uid[];
  /** A Horn Special Card sitting in this Row's Horn slot. */
  horn: Uid | null;
}

export interface SideState {
  faction: FactionId;
  leader: CardId;
  leaderUsed: boolean;
  /** Ordered: index 0 is the top of the deck. Hidden from both views. */
  deck: Uid[];
  hand: Uid[];
  discard: Uid[];
  rows: Record<RowId, RowState>;
  gems: number;
  passed: boolean;
}

export type MatchResult =
  | { outcome: "win"; winner: Seat; reason: "gems" | "forfeit" }
  | { outcome: "draw" };

export type Phase = "turns" | "ended";

/** Plain JSON data: the Room snapshots it (ADR-0003). */
export interface MatchState {
  version: 1;
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
