import type { Action, ChooseAction } from "./actions";
import type { MatchEvent } from "./events";
import { bondCopies, distinctIds, takeFromDeck, weatherInDeck } from "./leader";
import { playableRows } from "./legal";
import { medicTargets, playUnit, ref } from "./play";
import { shuffle } from "./rng";
import { type MatchState, opponent, type PendingChoice } from "./state";
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
    case "leaderWeather":
      return weatherInDeck(state, pending.seat).map(
        (cardId): ChooseAction => ({ type: "choose", cardId }),
      );
    case "leaderReturn":
      return state.sides[pending.seat].discard.map(
        (card): ChooseAction => ({ type: "choose", card }),
      );
    case "leaderDraw":
      return distinctIds(state, state.sides[pending.seat].deck).map(
        (cardId): ChooseAction => ({ type: "choose", cardId }),
      );
    case "leaderBond":
      return bondCopies(state, pending.seat).map(
        ({ cardId, row }): ChooseAction => ({ type: "choose", cardId, row }),
      );
    case "firstTurn":
      return [pending.seat, opponent(pending.seat)].map(
        (starter): ChooseAction => ({ type: "choose", starter }),
      );
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
    case "leaderWeather": {
      if (action.cardId === undefined) throw new Error("Needs a card id");
      const uid = takeFromDeck(state, pending.seat, action.cardId);
      state.weather.push(uid);
      events.push({
        type: "cardPlayed",
        seat: pending.seat,
        card: ref(state, uid),
        zone: "weather",
        via: "leader",
      });
      return;
    }
    case "leaderReturn": {
      if (action.card === undefined) throw new Error("Needs a card");
      const side = state.sides[pending.seat];
      side.discard.splice(side.discard.indexOf(action.card), 1);
      side.hand.push(action.card);
      events.push({ type: "returnedToHand", seat: pending.seat, card: ref(state, action.card) });
      return;
    }
    case "leaderDraw": {
      if (action.cardId === undefined) throw new Error("Needs a card id");
      const uid = takeFromDeck(state, pending.seat, action.cardId);
      state.sides[pending.seat].hand.push(uid);
      shuffle(state, state.sides[pending.seat].deck);
      events.push({ type: "drew", seat: pending.seat, count: 1, cards: [ref(state, uid)] });
      return;
    }
    case "leaderBond": {
      if (action.cardId === undefined || action.row === undefined)
        throw new Error("Needs a card id and Row");
      const uid = takeFromDeck(state, pending.seat, action.cardId);
      playUnit(state, pending.seat, uid, action.row, events, "leader");
      return;
    }
    case "firstTurn":
      // Starting the Match hands out the Turn, so `applyAction` resolves it itself.
      throw new Error("The first Turn choice is resolved when the Match starts");
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
