import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import { createMatch, type Seat, viewFor } from "@card-duel/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchBoard, playsFor } from "./MatchBoard";

const { state } = createMatch({
  seed: 5,
  decks: [devPlainDeck("swarm"), devPlainDeck("court")],
  cards: DEV_PLAIN_CARDS,
});

describe("MatchBoard", () => {
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
    const rows = [...playsFor(view, card.uid).keys()];
    expect(rows).toHaveLength(1);
    const waiting = viewFor(state, state.turn === 0 ? 1 : 0);
    expect(playsFor(waiting, waiting.you.hand[0]?.uid ?? -1).size).toBe(0);
  });
});
