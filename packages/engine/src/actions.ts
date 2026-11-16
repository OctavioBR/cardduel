import type { RowId } from "./cards";
import type { Seat, Uid } from "./state";

/**
 * A play from the hand. `row` is set for Units and the Horn Special Card; `target` for
 * Decoy. Weather, Clear Weather and Scorch take neither.
 */
export interface PlayAction {
  type: "play";
  card: Uid;
  row?: RowId;
  target?: Uid;
}

export type Action = PlayAction | { type: "pass" } | { type: "forfeit" };

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
  | "invalid_target"
  | "invalid_action";

export interface Rejection {
  code: RejectionCode;
  message: string;
}

/** Stable key for comparing actions (field order independent). */
export function actionKey(action: Action): string {
  switch (action.type) {
    case "play":
      return `play:${action.card}:${action.row ?? ""}:${action.target ?? ""}`;
    default:
      return action.type;
  }
}
