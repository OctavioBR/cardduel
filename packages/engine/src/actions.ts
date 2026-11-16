import type { RowId } from "./cards";
import type { Seat, Uid } from "./state";

export type Action =
  | { type: "play"; card: Uid; row: RowId }
  | { type: "pass" }
  | { type: "forfeit" };

export interface LoggedAction {
  seat: Seat;
  action: Action;
}

export type RejectionCode =
  | "match_over"
  | "not_your_turn"
  | "already_passed"
  | "card_not_in_hand"
  | "invalid_row"
  | "invalid_action";

export interface Rejection {
  code: RejectionCode;
  message: string;
}
