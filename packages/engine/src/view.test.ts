import { describe, expect, it } from "vitest";
import type { Action } from "./actions";
import { type CardDefinition, ROWS } from "./cards";
import { legalActions } from "./legal";
import { applyAction, createMatch } from "./match";
import { type MatchState, opponent, SEATS, type Seat, type Uid } from "./state";
import { deck, playCard, repeat, setup, startMatch, unit } from "./testing/fixtures";
import { expectNoHiddenCards, uidsIn } from "./testing/hidden";
import { playRandomMatch } from "./testing/random";
import { filterEvents, viewFor } from "./view";

const CARDS = [
  unit("a", 2, "close"),
  unit("b", 4, "ranged"),
  unit("c", 6, "siege"),
  unit("d", 8, "close"),
];
const LIST = [...repeat("a", 6), ...repeat("b", 6), ...repeat("c", 6), ...repeat("d", 4)];
const SETUP = setup(99, [deck(LIST), deck(LIST, "court")], CARDS);

describe("viewFor", () => {
  it("shows your hand and deck counts, and only sizes for the opponent", () => {
    const { state } = createMatch(SETUP);
    const view = viewFor(state, 0);
    expect(view.you.hand).toHaveLength(10);
    expect(view.you.deckSize).toBe(12);
    expect(view.you.deck.reduce((n, d) => n + d.count, 0)).toBe(12);
    expect(view.opponent.handSize).toBe(10);
    expect(view.opponent.deckSize).toBe(12);
    expect(view.opponent).not.toHaveProperty("hand");
    expect(view.opponent.faction).toBe("court");
    expect(view.board.you.rows.close).toEqual({ units: [], horn: null, score: 0 });
  });

  it("reports Scores per Row and in total, and whose Turn it is", () => {
    let { state } = startMatch(SETUP);
    const a = state.turn as Seat;
    ({ state } = playCard(state, a, "d"));
    ({ state } = playCard(state, opponent(a), "b"));
    const view = viewFor(state, a);
    expect(view.turn).toBe("you");
    expect(view.board.you.rows.close.score).toBe(8);
    expect(view.board.you.score).toBe(8);
    expect(view.board.opponent.rows.ranged.units).toEqual([
      expect.objectContaining({ cardId: "b", strength: 4 }),
    ]);
    expect(view.board.opponent.score).toBe(4);
    expect(viewFor(state, opponent(a)).turn).toBe("opponent");
  });

  it("lists no legal actions for the Seat not to move", () => {
    const { state } = startMatch(SETUP);
    expect(viewFor(state, opponent(state.turn as Seat)).legalActions).toEqual([]);
  });

  it("is JSON and a few KB in size", () => {
    playRandomMatch(SETUP, 5, ({ after }) => {
      for (const seat of SEATS) {
        const json = JSON.stringify(viewFor(after, seat));
        expect(JSON.parse(json)).toEqual(viewFor(after, seat));
        expect(json.length).toBeLessThan(8 * 1024);
      }
    });
  });
});

describe("filterEvents", () => {
  it("turns the opponent's draw into a count and keeps your own cards", () => {
    const { state, events } = createMatch(SETUP);
    const filtered = filterEvents(events, 0);
    const own = filtered.find((e) => e.type === "drew" && e.seat === 0);
    const theirs = filtered.find((e) => e.type === "drew" && e.seat === 1);
    expect(own).toMatchObject({ count: 10, cards: expect.any(Array) });
    expect(theirs).toEqual({ type: "drew", seat: 1, count: 10 });
    expect(state.sides[0].hand).toHaveLength(10);
  });
});

describe("hidden information", () => {
  it("no view or filtered event ever contains the opponent's hand or either deck", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = { ...SETUP, seed };
      const { state, events } = createMatch(s);
      for (const seat of SEATS) {
        const hidden = new Set([
          ...state.sides[opponent(seat)].hand,
          ...state.sides[0].deck,
          ...state.sides[1].deck,
        ]);
        const seen = uidsIn([viewFor(state, seat), filterEvents(events, seat)]);
        expect(seen.filter((u) => hidden.has(u))).toEqual([]);
      }
      expectNoHiddenCards(s, seed + 1000);
    }
  });

  it("also holds with Leaders that look at the opponent's hand and draw chosen cards", () => {
    const look: CardDefinition = {
      id: "leader-look",
      kind: "leader",
      faction: "court",
      maxCopies: 1,
      ability: { type: "lookAtOpponentHand" },
    };
    const pick: CardDefinition = {
      id: "leader-pick",
      kind: "leader",
      faction: "court",
      maxCopies: 1,
      ability: { type: "drawChosenFromDeck" },
    };
    const s = {
      ...SETUP,
      decks: [
        { ...deck(LIST), leader: look.id },
        { ...deck(LIST), leader: pick.id },
      ] as typeof SETUP.decks,
      cards: [...SETUP.cards, look, pick],
    };
    for (let seed = 0; seed < 40; seed++) expectNoHiddenCards({ ...s, seed }, seed + 7);
  });
});

describe("legalActions", () => {
  it("every listed action is accepted, and unlisted actions are rejected", () => {
    for (let seed = 0; seed < 30; seed++) {
      playRandomMatch({ ...SETUP, seed }, seed, ({ after }) => {
        if (after.phase === "ended") return;
        for (const seat of SEATS) {
          const listed = legalActions(after, seat);
          const keys = new Set(listed.map((a) => JSON.stringify(a)));
          for (const action of listed) expect(applyAction(after, seat, action).ok).toBe(true);
          for (const action of candidates(after)) {
            if (keys.has(JSON.stringify(action))) continue;
            expect(applyAction(after, seat, action).ok, JSON.stringify(action)).toBe(false);
          }
        }
      });
    }
  });
});

/** A broad sample of actions: every card to every Row, plus Pass. */
function candidates(state: MatchState): Action[] {
  const actions: Action[] = [{ type: "pass" }];
  for (let uid = 0; uid < state.cards.length; uid += 3) {
    for (const row of ROWS) actions.push({ type: "play", card: uid, row });
  }
  return actions;
}
