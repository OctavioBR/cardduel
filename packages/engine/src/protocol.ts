import type { Action } from "./actions";
import type { MatchEvent } from "./events";
import type { Seat } from "./state";
import type { SeatView } from "./view";

/** Messages a client sends to its Room over the WebSocket (ADR-0002). */
export type ClientMessage =
  | {
      type: "action";
      /** The `actionCount` of the last view the client saw. Stale actions are rejected. */
      actionCount: number;
      action: Action;
    }
  /** Take your Seat by committing one of your saved Decks (GLOSSARY.md: Seat). */
  | { type: "takeSeat"; deckId: string }
  | { type: "rematch" }
  | { type: "leave" };

export type ServerErrorCode =
  | "room_full"
  | "room_not_found"
  | "signed_out"
  | "invalid_deck"
  | "not_started"
  | "stale_action"
  | "rejected"
  | "bad_message";

/**
 * Before the Match: who is in the Room and whether each Seat is taken. Neither player sees
 * the other's Deck, Faction or Leader until both have taken a Seat.
 */
export interface LobbyInfo {
  code: string;
  competitive: boolean;
  seat: Seat;
  you: { seated: boolean; deckName: string | null; lastDeckId?: string | null };
  opponent: { present: boolean; seated: boolean; username: string | null };
}

/** Messages a Room sends to one Seat. */
export type ServerMessage =
  | { type: "rematch"; accepted: boolean; opponentAccepted: boolean; declined: boolean }
  | { type: "lobby"; lobby: LobbyInfo }
  /** Your complete view, plus the filtered events that led to it (empty on reconnect). */
  | { type: "view"; view: SeatView; events: MatchEvent[] }
  | { type: "error"; code: ServerErrorCode; message: string };

/** WebSocket close code sent with "Room full". */
export const CLOSE_ROOM_FULL = 4003;
/** WebSocket close code sent when the Room code does not exist. */
export const CLOSE_ROOM_NOT_FOUND = 4004;
/** WebSocket close code sent when the connection has no signed-in session. */
export const CLOSE_SIGNED_OUT = 4401;
