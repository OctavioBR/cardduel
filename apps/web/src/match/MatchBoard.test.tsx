import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import { applyAction, createMatch, type MatchState, type Seat, viewFor } from "@card-duel/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchBoard } from "./MatchBoard";
import { targetsFor } from "./targets";

const created = createMatch({
  seed: 5,
  decks: [devPlainDeck("swarm"), devPlainDeck("court")],
  cards: DEV_PLAIN_CARDS,
}).state;
/** Both Seats keep their hands, so the first Turn has started. */
const state = [0, 1].reduce<MatchState>((s, seat) => {
  const result = applyAction(s, seat as Seat, { type: "confirmRedraw" });
  if (!result.ok) throw new Error(result.rejection.message);
  return result.state;
}, created);

describe("MatchBoard", () => {
  it("shows Redraw controls before the first Turn", () => {
    const html = renderToStaticMarkup(<MatchBoard view={viewFor(created, 0)} send={() => {}} />);
    expect(html).toContain("Keep hand");
    expect(html).toContain("0/2 returned");
  });

  it("renders six Rows, the hand and Pass from the view", () => {
    const view = viewFor(state, state.turn as Seat);
    const html = renderToStaticMarkup(<MatchBoard view={view} send={() => {}} />);
    expect(html.match(/data-testid="row-/g)).toHaveLength(6);
    expect(html.match(/data-testid="hand-card"/g)).toHaveLength(10);
    expect(html).toContain("Your Turn");
    expect(html).toContain("Pass");
  });

  it("takes playable Rows only from the view's legal actions", () => {
    const view = viewFor(state, state.turn as Seat);
    const card = view.you.hand[0];
    if (!card) throw new Error("empty hand");
    const targets = targetsFor(view, card.uid);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ kind: "row", side: "you" });
    expect(targets[0]?.action.preview).toBeDefined();
    const waiting = viewFor(state, state.turn === 0 ? 1 : 0);
    expect(targetsFor(waiting, waiting.you.hand[0]?.uid ?? -1)).toEqual([]);
  });
});
