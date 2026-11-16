import type { MatchEvent } from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { roundSummary } from "./FlowOverlays";

const ended = (winner: 0 | 1 | null): MatchEvent => ({
  type: "roundEnded",
  round: 1,
  scores: [12, 9],
  winner,
  gems: [2, 1],
});

describe("roundSummary", () => {
  it("reports Scores, Gems lost and the winner from the Seat's point of view", () => {
    expect(roundSummary([ended(0)], 1)).toEqual({
      round: 1,
      scores: { you: 9, opponent: 12 },
      gemsLost: { you: 1, opponent: 0 },
      winner: "opponent",
      passives: [],
    });
  });

  it("a Tie costs both a Gem", () => {
    expect(roundSummary([ended(null)], 0)?.gemsLost).toEqual({ you: 1, opponent: 1 });
  });

  it("lists the passives that fired", () => {
    const events: MatchEvent[] = [
      { type: "factionPassive", seat: 1, faction: "court", effect: "wonTie" },
      ended(1),
      {
        type: "factionPassive",
        seat: 0,
        faction: "swarm",
        effect: "keptUnit",
        card: { uid: 3, cardId: "swarm-hive-drone" },
      },
    ];
    expect(roundSummary(events, 0)?.passives).toEqual([
      "Your opponent's Court won the Tie.",
      "Your Swarm kept Hive Drone on the battlefield.",
    ]);
  });

  it("is null without a Round end", () => {
    expect(roundSummary([{ type: "passed", seat: 0, auto: false }], 0)).toBeNull();
  });
});
