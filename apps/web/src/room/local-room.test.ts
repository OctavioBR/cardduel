import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import {
  type Action,
  applyAction,
  createMatch,
  type MatchSetup,
  type Seat,
  viewFor,
} from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { LocalRoom } from "./local-room";

const SETUP: MatchSetup = {
  seed: 77,
  decks: [devPlainDeck("swarm"), devPlainDeck("court")],
  cards: DEV_PLAIN_CARDS,
};

function pick(room: LocalRoom, i: number): Action {
  const view = room.getState().view;
  if (!view) throw new Error("no view");
  const plays = view.legalActions.filter((a) => a.type === "play");
  return i % 4 === 3 || plays.length === 0 ? { type: "pass" } : (plays[i % plays.length] as Action);
}

describe("LocalRoom", () => {
  it("produces the same views the engine produces, for actions from either Seat", () => {
    const room = new LocalRoom(SETUP);
    let engine = createMatch(SETUP).state;
    for (let i = 0; i < 60 && engine.phase !== "ended"; i++) {
      const seat = engine.turn as Seat;
      room.viewSeat(seat);
      const action = pick(room, i);
      room.send(action);
      const result = applyAction(engine, seat, action);
      if (!result.ok) throw new Error(result.rejection.message);
      engine = result.state;
      expect(room.getState().view).toEqual(viewFor(engine, seat));
      expect(room.getState().error).toBeNull();
    }
    expect(engine.actionCount).toBeGreaterThan(10);
  });

  it("switching Seats shows only that Seat's filtered view", () => {
    const room = new LocalRoom(SETUP);
    room.viewSeat(0);
    const v0 = room.getState().view;
    room.viewSeat(1);
    const v1 = room.getState().view;
    expect(v0?.seat).toBe(0);
    expect(v1?.seat).toBe(1);
    expect(v0).toEqual(viewFor(room.matchState, 0));
    expect(v1).toEqual(viewFor(room.matchState, 1));
    const hand0 = new Set(room.matchState.sides[0].hand);
    expect(JSON.stringify(v1)).not.toMatch(new RegExp(`"uid":(${[...hand0].join("|")}),`));
  });

  it("filters events for the Seat being looked at", () => {
    const room = new LocalRoom(SETUP);
    const seen: unknown[] = [];
    room.subscribe(({ events }) => seen.push(...events));
    const seat = room.matchState.turn as Seat;
    room.viewSeat(seat);
    room.send(pick(room, 0));
    expect(seen.length).toBeGreaterThan(0);
  });

  it("reports a rejected action without changing the view", () => {
    const room = new LocalRoom(SETUP);
    const waiting = room.matchState.turn === 0 ? 1 : 0;
    room.viewSeat(waiting);
    const before = room.getState().view;
    room.send({ type: "pass" });
    expect(room.getState().error).toMatchObject({ code: "rejected" });
    expect(room.getState().view).toBe(before);
  });
});
