import {
  type Action,
  applyAction,
  createMatch,
  legalActions,
  type MatchState,
  type Seat,
} from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { checkCompetitiveDeck, checkValidDeck } from "./deck-checks";
import { validateCatalog } from "./validate";
import { getCatalog } from "./versions";

const v1 = getCatalog("v1");

describe("Card Catalog v1", () => {
  it("passes validation", () => {
    expect(validateCatalog(v1)).toEqual([]);
  });

  it("both Starter Decks are Competitive Decks", () => {
    for (const deck of Object.values(v1.starterDecks)) {
      expect(checkValidDeck(deck, v1)).toEqual([]);
      expect(checkCompetitiveDeck(deck, v1)).toEqual([]);
    }
  });

  it("makes the 130 total-Strength cap a real constraint", () => {
    for (const faction of ["swarm", "court"] as const) {
      const strengths = v1.cards
        .filter((c) => c.kind === "unit" && (c.faction === faction || c.faction === "neutral"))
        .flatMap((c) => (c.kind === "unit" ? Array<number>(c.maxCopies).fill(c.strength) : []))
        .sort((a, b) => b - a);
      const strongest22 = strengths.slice(0, 22).reduce((n, s) => n + s, 0);
      expect(strongest22, faction).toBeGreaterThan(v1.limits.competitive.maxUnitStrength);
    }
  });

  it("has three Swarm Leaders, four Court Leaders (one passive) and the v1 Neutral Special Cards", () => {
    const leaders = (faction: string) =>
      v1.cards.filter((c) => c.kind === "leader" && c.faction === faction);
    expect(leaders("swarm")).toHaveLength(3);
    expect(leaders("court")).toHaveLength(4);
    expect(
      v1.cards.flatMap((c) =>
        c.kind === "leader" && c.ability.type === "passive" ? [c.ability.passive] : [],
      ),
    ).toEqual(["steadyGround"]);
    const effects = v1.cards.flatMap((c) =>
      c.kind === "special"
        ? [c.effect.type === "weather" ? `weather:${c.effect.rows.join("+")}` : c.effect.type]
        : [],
    );
    expect(effects.sort()).toEqual(
      [
        "clearWeather",
        "decoy",
        "horn",
        "scorch",
        "weather:close",
        "weather:ranged",
        "weather:ranged+siege",
        "weather:siege",
      ].sort(),
    );
  });

  it("plays a whole Match with the two Starter Decks", () => {
    for (let seed = 0; seed < 10; seed++) {
      let state: MatchState = createMatch({
        seed,
        decks: [v1.starterDecks.swarm, v1.starterDecks.court],
        cards: v1.cards,
      }).state;
      for (let step = 0; step < 300 && state.phase !== "ended"; step++) {
        const seat: Seat =
          state.phase === "redraw" ? (state.sides[0].redraw.done ? 1 : 0) : (state.turn as Seat);
        const options = legalActions(state, seat);
        const action = (step % 4 === 3 ? options.at(-1) : options[step % options.length]) as Action;
        const result = applyAction(state, seat, action);
        if (!result.ok) throw new Error(result.rejection.message);
        state = result.state;
      }
      expect(state.phase).toBe("ended");
    }
  });
});
