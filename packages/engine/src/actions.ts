import type { CardId, RowId } from "./cards";
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

/**
 * An answer to a Pending Choice. Public cards (a Discard Pile) are named by `card`; cards
 * from your own deck by `cardId`, so the choice never reveals deck uids. `row` is set when
 * the chosen Unit is Played.
 */
export interface ChooseAction {
  type: "choose";
  card?: Uid;
  cardId?: CardId;
  row?: RowId;
}

export type Action = PlayAction | ChooseAction | { type: "pass" } | { type: "forfeit" };

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
    case "choose":
      return `choose:${action.card ?? ""}:${action.cardId ?? ""}:${action.row ?? ""}`;
    default:
      return action.type;
  }
}
