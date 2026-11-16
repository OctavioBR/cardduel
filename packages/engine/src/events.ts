import type { CardId, RowId } from "./cards";
import type { MatchResult, PendingKind, Seat, Uid } from "./state";

/** A card made visible by an event: its instance id plus what it is. */
export interface CardRef {
  uid: Uid;
  cardId: CardId;
}

export interface StrengthChange {
  uid: Uid;
  from: number;
  to: number;
}

/**
 * Everything that happens, in order. Events exist so the client can animate a change;
 * the view stays the truth (ADR-0002). Unfiltered events may contain hidden cards;
 * `filterEvents` produces each Seat's version.
 */
export type MatchEvent =
  | { type: "coinFlip"; starter: Seat }
  | DrewEvent
  | {
      type: "cardPlayed";
      seat: Seat;
      card: CardRef;
      /** Where it landed: a Row for Units and Horn, "weather" for Weather cards. */
      zone: RowId | "weather" | "none";
      /** The Seat whose side the card sits on, when it is on the battlefield. */
      side?: Seat;
      /** Set when something other than the hand Played it. */
      via?: PlayedVia;
    }
  | { type: "weatherCleared"; cards: CardRef[] }
  /** Units destroyed (Scorch); each went to its Controller's Discard Pile. */
  | { type: "destroyed"; cards: CardRef[] }
  /** A card left the battlefield for its player's hand (Decoy). */
  | { type: "returnedToHand"; seat: Seat; card: CardRef }
  /** Current Strength of Units on the battlefield changed. */
  | { type: "strengthChanged"; changes: StrengthChange[] }
  /** Redraw: a card went back into the deck. `card` is present only for its Seat. */
  | { type: "cardReturned"; seat: Seat; card?: CardRef }
  | { type: "redrawDone"; seat: Seat; returned: number }
  | { type: "passed"; seat: Seat; auto: boolean }
  /** A Seat must now make a Pending Choice. */
  | { type: "choiceRequired"; seat: Seat; kind: PendingKind }
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

/** What Played a card onto the battlefield. */
export type PlayedVia = "hand" | "medic" | "muster";
