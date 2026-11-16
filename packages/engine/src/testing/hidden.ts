import { expect } from "vitest";
import { type MatchSetup, opponent, SEATS, type Seat, type Uid } from "../state";
import { filterEvents, viewFor } from "../view";
import { playRandomMatch } from "./random";

/** Every number under a uid-carrying key ("uid", "card", "target") anywhere in a value. */
export function uidsIn(value: unknown, out: Uid[] = []): Uid[] {
  if (Array.isArray(value)) for (const v of value) uidsIn(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "uid" || k === "card" || k === "target") && typeof v === "number") out.push(v);
      else uidsIn(v, out);
    }
  }
  return out;
}

/**
 * Plays a random Match and checks, after every action and for both Seats, that no view or
 * filtered event names a hidden card: one in either deck, or in the opponent's hand unless
 * that card became public (returned to the hand from the battlefield or Discard Pile, or
 * seen with a "look at 3" Leader). A Seat may also see the card it just returned in Redraw.
 */
export function expectNoHiddenCards(setup: MatchSetup, pickerSeed: number): void {
  const publicInHand: [Set<Uid>, Set<Uid>] = [new Set(), new Set()];
  playRandomMatch(setup, pickerSeed, ({ after, events }) => {
    for (const e of events) {
      if (e.type === "returnedToHand") publicInHand[e.seat].add(e.card.uid);
    }
    for (const seat of SEATS) {
      const other: Seat = opponent(seat);
      const known = new Set([...after.sides[seat].known, ...publicInHand[other]]);
      const hidden = new Set<Uid>([
        ...after.sides[other].hand.filter((uid) => !known.has(uid)),
        ...after.sides[0].deck,
        ...after.sides[1].deck,
      ]);
      for (const e of events) {
        if (e.type === "cardReturned" && e.seat === seat && e.card) hidden.delete(e.card.uid);
      }
      const seen = uidsIn([viewFor(after, seat), filterEvents(events, seat)]);
      expect(
        seen.filter((uid) => hidden.has(uid)),
        `Seat ${seat} saw hidden cards`,
      ).toEqual([]);
    }
  });
}
