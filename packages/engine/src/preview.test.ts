import { describe, expect, it } from "vitest";
import { ROWS } from "./cards";
import { hasPreview, previewFor } from "./preview";
import { type MatchState, opponent, SEATS, type Seat } from "./state";
import { computeStrengths, rowScore, totalScore } from "./strength";
import {
  act,
  deck,
  place,
  repeat,
  setup,
  special,
  startMatch,
  toHand,
  unit,
} from "./testing/fixtures";
import { expectNoHiddenCards } from "./testing/hidden";
import { playRandomMatch } from "./testing/random";
import { richSetup } from "./testing/rich";
import { viewFor } from "./view";

describe("Play Previews", () => {
  it("each preview matches the real outcome once its action is applied", () => {
    let checked = 0;
    for (let seed = 0; seed < 80; seed++) {
      playRandomMatch(richSetup(seed), seed * 7 + 1, ({ before, seat, action, after, events }) => {
        if (!hasPreview(action)) return;
        // A preview stops at the play's resolution; if the action also ended the Round
        // (an emptied hand auto-Passes), the board has since been cleared.
        if (events.some((e) => e.type === "roundEnded")) return;
        const preview = previewFor(before, seat, action);
        const strengths = computeStrengths(after);
        const other = opponent(seat);
        expect(preview.totals).toEqual({
          you: totalScore(after, seat, strengths),
          opponent: totalScore(after, other, strengths),
        });
        for (const row of ROWS) {
          expect(preview.rows.you[row]).toBe(rowScore(after, seat, row, strengths));
          expect(preview.rows.opponent[row]).toBe(rowScore(after, other, row, strengths));
        }
        const destroyed = events.flatMap((e) => (e.type === "destroyed" ? e.cards : []));
        expect(preview.destroyed).toEqual(destroyed);
        const drawn = events
          .filter((e) => e.type === "drew" && e.seat === seat)
          .reduce((n, e) => n + (e.type === "drew" ? e.count : 0), 0);
        expect(preview.drawn).toBe(drawn);
        for (const unit of preview.units) {
          if (unit.uid !== undefined) expect(strengths.get(unit.uid)).toBe(unit.to);
        }
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("is attached to every play, Leader ability and choice in the moving Seat's view", () => {
    let views = 0;
    playRandomMatch(richSetup(3), 11, ({ after }) => {
      for (const seat of SEATS) {
        for (const legal of viewFor(after, seat).legalActions) {
          expect(legal.preview !== undefined).toBe(hasPreview(legal));
        }
        views++;
      }
    });
    expect(views).toBeGreaterThan(20);
  });

  it("keeps views small with previews included", () => {
    for (let seed = 0; seed < 20; seed++) {
      playRandomMatch(richSetup(seed), seed, ({ after }) => {
        for (const seat of SEATS)
          expect(JSON.stringify(viewFor(after, seat)).length).toBeLessThan(16 * 1024);
      });
    }
  });

  it("never reveals hidden information, previews included", () => {
    for (let seed = 0; seed < 60; seed++) expectNoHiddenCards(richSetup(seed), seed + 500);
  });
});

describe("Play Preview contents", () => {
  const CARDS = [
    unit("six", 6, "close"),
    unit("bond", 4, "close", { abilities: ["tightBond"] }),
    unit("spy", 3, "ranged", { abilities: ["spy"] }),
    unit("wasp", 2, "close", { abilities: ["muster"], musterGroup: "hive" }),
    special("scorch", { type: "scorch" }),
    special("horn", { type: "horn" }),
  ];
  const LIST = [
    ...repeat("six", 6),
    ...repeat("bond", 3),
    ...repeat("spy", 2),
    ...repeat("wasp", 3),
    "scorch",
    "horn",
  ];
  function board(): { state: MatchState; a: Seat; b: Seat } {
    const { state } = startMatch(setup(13, [deck(LIST, "court"), deck(LIST, "court")], CARDS));
    const a = state.turn as Seat;
    return { state, a, b: opponent(a) };
  }

  it("Scorch: tints exactly the cards that are then destroyed", () => {
    const { state, a, b } = board();
    const mine = place(state, a, "six", "close");
    const theirs = place(state, b, "six", "close");
    place(state, b, "bond", "close");
    const scorch = toHand(state, a, "scorch");
    const preview = previewFor(state, a, { type: "play", card: scorch });
    expect(preview.destroyed.map((c) => c.uid).sort()).toEqual([mine, theirs].sort());
    const { events } = act(state, a, { type: "play", card: scorch });
    expect(events.find((e) => e.type === "destroyed")).toMatchObject({ cards: preview.destroyed });
  });

  it("Horn: shows the doubled Score", () => {
    const { state, a } = board();
    const six = place(state, a, "six", "close");
    const horn = toHand(state, a, "horn");
    const preview = previewFor(state, a, { type: "play", card: horn, row: "close" });
    expect(preview.rows.you.close).toBe(12);
    expect(preview.units).toEqual([
      { uid: six, cardId: "six", side: "you", row: "close", from: 6, to: 12 },
    ]);
  });

  it("Spy: the ghost card on the opponent's side and +2 cards drawn, as a count", () => {
    const { state, a } = board();
    const spy = toHand(state, a, "spy");
    const preview = previewFor(state, a, { type: "play", card: spy, row: "ranged" });
    expect(preview.drawn).toBe(2);
    expect(preview.units).toEqual([
      { uid: spy, cardId: "spy", side: "opponent", row: "ranged", from: null, to: 3 },
    ]);
    expect(preview.totals.opponent).toBe(3);
  });

  it("Muster: names cards from your own deck by id only", () => {
    const { state, a } = board();
    // Keep one Wasp in hand and the others in the deck.
    const hand = state.sides[a].hand;
    for (const uid of hand.filter((u) => state.cards[u]?.cardId === "wasp")) {
      hand.splice(hand.indexOf(uid), 1);
      state.sides[a].deck.push(uid);
    }
    const wasp = toHand(state, a, "wasp");
    const preview = previewFor(state, a, { type: "play", card: wasp, row: "close" });
    const fromDeck = preview.units.filter((u) => u.uid === undefined);
    expect(fromDeck.length).toBeGreaterThan(0);
    for (const u of fromDeck) expect(u.cardId).toBe("wasp");
    expect(preview.rows.you.close).toBe(6);
  });

  it("does not change the real state", () => {
    const { state, a } = board();
    const wasp = toHand(state, a, "wasp");
    const snapshot = JSON.stringify(state);
    previewFor(state, a, { type: "play", card: wasp, row: "close" });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
