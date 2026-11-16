import type { Action } from "./actions";
import type { MatchEvent } from "./events";
import type { Seat } from "./state";
import type { SeatView } from "./view";

/** Messages a client sends to its Room over the WebSocket (ADR-0002). */
export type ClientMessage = {
  type: "action";
  /** The `actionCount` of the last view the client saw. Stale actions are rejected. */
  actionCount: number;
  action: Action;
};

export type ServerErrorCode =
  | "room_full"
  | "room_not_found"
  | "not_started"
  | "stale_action"
  | "rejected"
  | "bad_message";

/** Messages a Room sends to one Seat. */
export type ServerMessage =
  /** You hold a Seat; the opponent has not taken theirs yet. */
  | { type: "waiting"; seat: Seat; code: string }
  /** Your complete view, plus the filtered events that led to it (empty on reconnect). */
  | { type: "view"; view: SeatView; events: MatchEvent[] }
  | { type: "error"; code: ServerErrorCode; message: string };

/** WebSocket close code sent with "Room full". */
export const CLOSE_ROOM_FULL = 4003;
/** WebSocket close code sent when the Room code does not exist. */
export const CLOSE_ROOM_NOT_FOUND = 4004;
