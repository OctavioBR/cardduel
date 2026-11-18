import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import {
  type Action,
  applyAction,
  createMatch,
  filterEvents,
  type MatchState,
  type Seat,
  viewFor,
} from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { cardName } from "../cards/strings";
import { lastActionText } from "./last-action";

const created = createMatch({
  seed: 5,
  decks: [devPlainDeck("swarm"), devPlainDeck("court")],
  cards: DEV_PLAIN_CARDS,
}).state;
const started = [0, 1].reduce<MatchState>((s, seat) => {
  const result = applyAction(s, seat as Seat, { type: "confirmRedraw" });
  if (!result.ok) throw new Error(result.rejection.message);
  return result.state;
}, created);
const actor = started.turn as Seat;
const other: Seat = actor === 0 ? 1 : 0;

/** Applies the actor's action and describes it from each Seat. */
function describeFromBothSeats(action: Action, timedOut = false) {
  const result = applyAction(started, actor, action, { timedOut });
  if (!result.ok) throw new Error(result.rejection.message);
  return [actor, other].map((seat) =>
    lastActionText(filterEvents(result.events, seat), seat, viewFor(result.state, seat)),
  );
}

describe("lastActionText", () => {
  it("names the card Played, from each Seat's point of view", () => {
    const view = viewFor(started, actor);
    const play = view.legalActions.find((a) => a.type === "play");
    if (play?.type !== "play") throw new Error("no play");
    const card = view.you.hand.find((c) => c.uid === play.card);
    const name = cardName(card?.cardId ?? "");
    const { preview: _preview, ...action } = play;
    expect(describeFromBothSeats(action as Action)).toEqual([
      `You played ${name}.`,
      `Your opponent played ${name}.`,
    ]);
  });

  it("describes a Pass", () => {
    expect(describeFromBothSeats({ type: "pass" })).toEqual([
      "You Passed.",
      "Your opponent Passed.",
    ]);
  });

  it("says when the Turn Timer ran out", () => {
    expect(describeFromBothSeats({ type: "pass" }, true)).toEqual([
      "Time ran out. You Passed.",
      "Time ran out. Your opponent Passed.",
    ]);
  });

  it("is null for a batch without a Turn, such as a Redraw", () => {
    const result = applyAction(created, 0, { type: "confirmRedraw" });
    if (!result.ok) throw new Error(result.rejection.message);
    expect(lastActionText(result.events, 0, viewFor(result.state, 0))).toBeNull();
  });
});
