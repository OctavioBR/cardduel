import { describe, expect, it } from "vitest";
import type { Action } from "./actions";
import { type CardDefinition, ROWS } from "./cards";
import { legalActions } from "./legal";
import { applyAction, createMatch } from "./match";
import { type MatchState, opponent, SEATS, type Seat, type Uid } from "./state";
import { deck, playCard, repeat, setup, startMatch, unit } from "./testing/fixtures";
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

/** Uids a Seat must never see: the opponent's hand (except cards it saw) and both decks. */
function hiddenFrom(state: MatchState, seat: Seat): Set<Uid> {
  const known = new Set(state.sides[seat].known);
  return new Set([
    ...state.sides[opponent(seat)].hand.filter((uid) => !known.has(uid)),
    ...state.sides[0].deck,
    ...state.sides[1].deck,
  ]);
}

/** Every `uid` field anywhere in a JSON value. */
function uidsIn(value: unknown, out: Uid[] = []): Uid[] {
  if (Array.isArray(value)) for (const v of value) uidsIn(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "uid" || k === "card" || k === "target") && typeof v === "number") out.push(v);
      else uidsIn(v, out);
    }
  }
  return out;
}

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
        const hidden = hiddenFrom(state, seat);
        const seen = uidsIn([viewFor(state, seat), filterEvents(events, seat)]);
        expect(seen.filter((u) => hidden.has(u))).toEqual([]);
      }
      playRandomMatch(s, seed + 1000, ({ after, events: stepEvents }) => {
        for (const seat of SEATS) {
          const hidden = hiddenFrom(after, seat);
          // A Seat knows which card it just returned in Redraw; the deck is reshuffled after.
          for (const e of stepEvents) {
            if (e.type === "cardReturned" && e.seat === seat && e.card) hidden.delete(e.card.uid);
          }
          const seen = uidsIn([viewFor(after, seat), filterEvents(stepEvents, seat)]);
          expect(seen.filter((u) => hidden.has(u))).toEqual([]);
        }
      });
    }
  });
});

describe("hidden information with Leaders that look and draw", () => {
  it("only cards a Seat has seen appear in its view", () => {
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
    for (let seed = 0; seed < 40; seed++) {
      playRandomMatch({ ...s, seed }, seed + 7, ({ after, events: stepEvents }) => {
        for (const seat of SEATS) {
          const hidden = hiddenFrom(after, seat);
          for (const e of stepEvents) {
            if (e.type === "cardReturned" && e.seat === seat && e.card) hidden.delete(e.card.uid);
          }
          const seen = uidsIn([viewFor(after, seat), filterEvents(stepEvents, seat)]);
          expect(seen.filter((u) => hidden.has(u))).toEqual([]);
        }
      });
    }
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
