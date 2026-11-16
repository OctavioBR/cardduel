import type { CardId, RowId } from "./cards";
import type { MatchResult, Seat, Uid } from "./state";

/** A card made visible by an event: its instance id plus what it is. */
export interface CardRef {
  uid: Uid;
  cardId: CardId;
}

/**
 * Everything that happens, in order. Events exist so the client can animate a change;
 * the view stays the truth (ADR-0002). Unfiltered events may contain hidden cards;
 * `filterEvents` produces each Seat's version.
 */
export type MatchEvent =
  | { type: "coinFlip"; starter: Seat }
  | DrewEvent
  | { type: "cardPlayed"; seat: Seat; card: CardRef; row: RowId }
  | { type: "passed"; seat: Seat; auto: boolean }
  | {
      type: "roundEnded";
      round: number;
      scores: [number, number];
      winner: Seat | null;
      gems: [number, number];
    }
  | { type: "cardsDiscarded"; cards: CardRef[] }
  | { type: "roundStarted"; round: number; starter: Seat }
  | { type: "forfeited"; seat: Seat }
  | { type: "matchEnded"; result: MatchResult };

/**
 * Cards drawn from a deck. `cards` is present only for the Seat that drew; the opponent's
 * filtered copy carries just the count.
 */
export interface DrewEvent {
  type: "drew";
  seat: Seat;
  count: number;
  cards?: CardRef[];
}
