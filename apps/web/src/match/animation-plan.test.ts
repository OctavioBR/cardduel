import type { MatchEvent } from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { planAnimations } from "./animation-plan";

const card = (uid: number, cardId = "x") => ({ uid, cardId });

describe("planAnimations", () => {
  it("maps every animated event kind to a step, in order", () => {
    const events: MatchEvent[] = [
      { type: "cardPlayed", seat: 0, card: card(1), zone: "close", side: 0 },
      { type: "cardPlayed", seat: 1, card: card(2), zone: "weather" },
      { type: "strengthChanged", changes: [{ uid: 1, from: 6, to: 1 }] },
      { type: "destroyed", cards: [card(3)] },
      { type: "returnedToHand", seat: 0, card: card(4) },
      { type: "drew", seat: 0, count: 2, cards: [card(5), card(6)] },
      { type: "drew", seat: 1, count: 2 },
      { type: "weatherCleared", cards: [card(2)] },
      { type: "roundEnded", round: 1, scores: [5, 3], winner: 0, gems: [2, 1] },
      { type: "cardsDiscarded", cards: [card(1)] },
      { type: "passed", seat: 0, auto: false },
    ];
    expect(planAnimations(events, 0).map((s) => s.kind)).toEqual([
      "enter",
      "enter",
      "weather",
      "strength",
      "leave",
      "move",
      "drawn",
      "drawn",
      "leave",
      "weather",
      "round",
      "leave",
    ]);
  });

  it("plays your cards from your hand and the opponent's from their side", () => {
    const steps = planAnimations(
      [
        { type: "cardPlayed", seat: 0, card: card(1), zone: "close", side: 0 },
        { type: "cardPlayed", seat: 1, card: card(2), zone: "close", side: 1 },
        { type: "cardPlayed", seat: 0, card: card(3), zone: "close", side: 0, via: "muster" },
      ],
      0,
    );
    expect(steps).toEqual([
      { kind: "enter", uids: [1], from: "yourHand" },
      { kind: "enter", uids: [2], from: "opponentHand" },
      { kind: "enter", uids: [3], from: "deck" },
    ]);
  });

  it("words the Round result from the Seat's point of view", () => {
    const ended = (winner: 0 | 1 | null): MatchEvent => ({
      type: "roundEnded",
      round: 2,
      scores: [1, 1],
      winner,
      gems: [1, 1],
    });
    expect(planAnimations([ended(1)], 1)).toEqual([{ kind: "round", text: "Round 2: you win" }]);
    expect(planAnimations([ended(1)], 0)).toEqual([
      { kind: "round", text: "Round 2: opponent wins" },
    ]);
    expect(planAnimations([ended(null)], 0)).toEqual([{ kind: "round", text: "Round 2: Tie" }]);
  });
});
