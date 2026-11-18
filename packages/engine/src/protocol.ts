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
  | { type: "claimWin" }
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
  | "bad_message"
  /** A Matched Room closed because a player did not connect in time; no Match was played. */
  | "no_match";

/**
 * Before the Match: who is in the Room and whether each Seat is taken. Neither player sees
 * the other's Deck, Faction or Leader until both have taken a Seat.
 */
export interface LobbyInfo {
  code: string;
  competitive: boolean;
  /** A Matched Room: created by the Queue, its code is shown to no one else. */
  matched: boolean;
  /** The Room's Turn Timer length in seconds, or null when it has none. */
  turnTimer: number | null;
  seat: Seat;
  you: { seated: boolean; deckName: string | null; lastDeckId?: string | null };
  opponent: { present: boolean; seated: boolean; displayName: string | null };
}

export interface DisconnectInfo {
  /** Server deadline, not a client permission: the Room checks it again on claim. */
  claimAt: number | null;
  serverNow: number;
}

/**
 * When each Seat's Turn Timer runs out, in server time (null: the Match is not waiting on
 * it). The Room acts on these deadlines itself; clients only count down.
 */
export interface TurnTimerInfo {
  you: number | null;
  opponent: number | null;
  serverNow: number;
}

/** Messages a Room sends to one Seat. */
export type ServerMessage =
  | { type: "rematch"; accepted: boolean; opponentAccepted: boolean; declined: boolean }
  | { type: "lobby"; lobby: LobbyInfo }
  | { type: "presence"; disconnect: DisconnectInfo }
  /**
   * Your complete view, plus the filtered events that led to it (empty on reconnect), and
   * the Turn Timer deadlines in a Room that has one.
   */
  | { type: "view"; view: SeatView; events: MatchEvent[]; turnTimer?: TurnTimerInfo }
  | { type: "error"; code: ServerErrorCode; message: string };

/** The two Queues, mirroring Casual and Competitive Rooms (GLOSSARY.md: Queue). */
export type QueueId = "casual" | "competitive";

export type MatchmakingErrorCode = "invalid_deck" | "signed_out" | "bad_request" | "replaced";

/** Messages the Matchmaker sends to a player in a Queue. */
export type MatchmakingMessage =
  /** In the Queue since `since` (server time). */
  | { type: "searching"; queue: QueueId; since: number; serverNow: number }
  /** Paired: both Seats are taken in this Room; the socket closes next. */
  | { type: "matched"; code: string }
  | { type: "error"; code: MatchmakingErrorCode; message: string };

/** Default Turn Timer length: every Matched Room, and the Create Room form's default. */
export const DEFAULT_TURN_TIMER_SECONDS = 120;
/** Shortest and longest Turn Timer a created Room may have. */
export const MIN_TURN_TIMER_SECONDS = 30;
export const MAX_TURN_TIMER_SECONDS = 600;

/** WebSocket close code sent with "Room full". */
export const CLOSE_ROOM_FULL = 4003;
/** WebSocket close code sent when the Room code does not exist. */
export const CLOSE_ROOM_NOT_FOUND = 4004;
/** WebSocket close code sent when the connection has no signed-in session. */
export const CLOSE_SIGNED_OUT = 4401;
/** WebSocket close code sent when a Matched Room closes because a player never connected. */
export const CLOSE_NO_MATCH = 4410;
/** WebSocket close code sent when the Matchmaker refuses to queue a player. */
export const CLOSE_QUEUE_REFUSED = 4422;
