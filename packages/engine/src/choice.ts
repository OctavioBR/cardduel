import type { Action, ChooseAction } from "./actions";
import type { MatchEvent } from "./events";
import { playableRows } from "./legal";
import { medicTargets, playUnit } from "./play";
import type { MatchState, PendingChoice } from "./state";
import { defOf } from "./strength";

/** Every option of a Pending Choice, as fully specified choose actions. */
export function choiceOptions(state: MatchState, pending: PendingChoice): Action[] {
  switch (pending.kind) {
    case "medic":
      return medicTargets(state, pending.seat).flatMap((card) => {
        const def = defOf(state, card);
        if (def.kind !== "unit") return [];
        return playableRows(def).map((row): ChooseAction => ({ type: "choose", card, row }));
      });
  }
}

/** Applies the chosen option. The caller has already removed `pending` from the queue. */
export function resolveChoice(
  state: MatchState,
  pending: PendingChoice,
  action: ChooseAction,
  events: MatchEvent[],
): void {
  switch (pending.kind) {
    case "medic": {
      if (action.card === undefined || action.row === undefined)
        throw new Error("Medic needs a card and Row");
      const discard = state.sides[pending.seat].discard;
      discard.splice(discard.indexOf(action.card), 1);
      playUnit(state, pending.seat, action.card, action.row, events, "medic");
      return;
    }
  }
}

/**
 * Drops leading Pending Choices that have no options left (nothing happens for them) and
 * announces the one that becomes active.
 */
export function settlePending(state: MatchState, events: MatchEvent[]): void {
  while (state.pending.length > 0) {
    const first = state.pending[0] as PendingChoice;
    if (choiceOptions(state, first).length > 0) {
      state.turn = first.seat;
      events.push({ type: "choiceRequired", seat: first.seat, kind: first.kind });
      return;
    }
    state.pending.shift();
  }
}
