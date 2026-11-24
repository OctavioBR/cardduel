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
 * the chosen Unit is Played. `starter` answers who takes the first Turn (Elves).
 */
export interface ChooseAction {
  type: "choose";
  card?: Uid;
  cardId?: CardId;
  row?: RowId;
  starter?: Seat;
}

/** Redraw: return one card from the opening hand (it is shuffled back, then replaced). */
export interface RedrawAction {
  type: "redraw";
  card: Uid;
}

/** Use the Leader's active ability. `row` is set for the Horn kind. */
export interface LeaderAction {
  type: "leader";
  row?: RowId;
}

export type Action =
  | PlayAction
  | LeaderAction
  | ChooseAction
  | RedrawAction
  | { type: "confirmRedraw" }
  | { type: "pass" }
  | { type: "forfeit" };

export interface LoggedAction {
  seat: Seat;
  action: Action;
  /**
   * The Room took this action for the Seat because its Turn Timer ran out (ADR-0009).
   * Replay applies it like any other action.
   */
  timedOut?: true;
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
    case "leader":
      return `leader:${action.row ?? ""}`;
    case "redraw":
      return `redraw:${action.card}`;
    case "choose":
      return `choose:${action.card ?? ""}:${action.cardId ?? ""}:${action.row ?? ""}:${action.starter ?? ""}`;
    default:
      return action.type;
  }
}
