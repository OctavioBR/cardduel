import { bench, describe } from "vitest";
import { ROWS } from "./cards";
import { applyAction, createMatch } from "./match";
import type { MatchState, Seat, Uid } from "./state";
import { richSetup } from "./testing/rich";
import { viewFor } from "./view";

/**
 * Worst case for building Play Previews: a full hand of many-target cards (two Decoys, a
 * Horn, two Agile Units, two Medics with a stocked Discard Pile, Scorch, a Muster card, a
 * Spy), a Horn Leader, and a busy battlefield on both sides.
 */
function worstCase(): { state: MatchState; seat: Seat } {
  const setup = richSetup(2); // Seat 0 gets the "hornRow" Leader for seed 2.
  let state = createMatch(setup).state;
  for (const seat of [0, 1] as const) {
    const result = applyAction(state, seat, { type: "confirmRedraw" });
    if (result.ok) state = result.state;
  }
  const seat: Seat = 0;
  state.turn = seat;
  const side = state.sides[seat];
  const pool = [...side.hand, ...side.deck];
  const take = (cardId: string): Uid => {
    const uid = pool.find((u) => state.cards[u]?.cardId === cardId);
    if (uid === undefined) throw new Error(`no ${cardId}`);
    pool.splice(pool.indexOf(uid), 1);
    return uid;
  };
  const hand = [
    "decoy",
    "decoy",
    "horn",
    "skirmisher",
    "skirmisher",
    "medic",
    "medic",
    "scorch",
    "wasp",
    "spy",
  ].map(take);
  const board = ["knight", "knight", "archer", "ram", "bond", "bond", "bond", "drummer"].map(take);
  const discard = ["bugler", "torch", "drone", "sage"].map(take);
  side.hand = hand;
  side.discard = discard;
  side.deck = pool;
  for (const [i, uid] of board.entries())
    side.rows[ROWS[i % 3] as (typeof ROWS)[number]].units.push(uid);
  const other = state.sides[1];
  const theirs = other.deck
    .filter((u) => state.defs[state.cards[u]?.cardId ?? ""]?.kind === "unit")
    .slice(0, 9);
  other.deck = other.deck.filter((u) => !theirs.includes(u));
  for (const [i, uid] of theirs.entries())
    other.rows[ROWS[i % 3] as (typeof ROWS)[number]].units.push(uid);
  return { state, seat };
}

describe("viewFor with Play Previews", () => {
  const { state, seat } = worstCase();
  const legal = viewFor(state, seat).legalActions.length;
  bench(`worst-case view (${legal} legal actions)`, () => {
    viewFor(state, seat);
  });
});
