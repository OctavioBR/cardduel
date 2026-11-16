import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import { CLOSE_ROOM_FULL, createMatch, viewFor } from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { BACKOFF_MS, roomSocketUrl, WebSocketRoom } from "./websocket-room";

class FakeSocket extends EventTarget {
  readyState = 0;
  sent: string[] = [];
  constructor(readonly url: string) {
    super();
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  receive(message: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
  drop(code: number) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event("close"), { code }));
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const room = new WebSocketRoom({
    url: "ws://localhost/api/rooms/ABC234/ws",
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s as unknown as WebSocket;
    },
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => {},
  });
  return { room, sockets, timers };
}

const VIEW = viewFor(
  createMatch({
    seed: 3,
    decks: [devPlainDeck("swarm"), devPlainDeck("court")],
    cards: DEV_PLAIN_CARDS,
  }).state,
  0,
);

describe("WebSocketRoom", () => {
  it("connects with the session cookie and tracks lobby, views and errors", () => {
    const { room, sockets } = harness();
    const socket = sockets[0] as FakeSocket;
    expect(socket.url).toBe("ws://localhost/api/rooms/ABC234/ws");
    expect(room.getState().status).toBe("connecting");
    socket.open();
    socket.receive({
      type: "lobby",
      lobby: {
        code: "ABC234",
        competitive: false,
        seat: 0,
        you: { seated: false, deckName: null },
        opponent: { present: false, seated: false, username: null },
      },
    });
    expect(room.getState()).toMatchObject({ status: "open", seat: 0, waitingCode: "ABC234" });
    const updates: unknown[] = [];
    room.subscribe((u) => updates.push(u.events));
    socket.receive({ type: "view", view: VIEW, events: [{ type: "coinFlip", starter: 0 }] });
    expect(room.getState()).toMatchObject({ view: VIEW, waitingCode: null });
    expect(updates).toEqual([[{ type: "coinFlip", starter: 0 }]]);
    socket.receive({ type: "error", code: "rejected", message: "No." });
    expect(room.getState().error).toEqual({ code: "rejected", message: "No." });
  });

  it("sends actions with the last action count it saw", () => {
    const { room, sockets } = harness();
    const socket = sockets[0] as FakeSocket;
    socket.open();
    socket.receive({ type: "view", view: { ...VIEW, actionCount: 7 }, events: [] });
    room.send({ type: "pass" });
    expect(JSON.parse(socket.sent[0] as string)).toEqual({
      type: "action",
      actionCount: 7,
      action: { type: "pass" },
    });
  });

  it("commits a Deck to take a Seat", () => {
    const { room, sockets } = harness();
    const socket = sockets[0] as FakeSocket;
    socket.open();
    room.takeSeat("deck-1");
    expect(JSON.parse(socket.sent[0] as string)).toEqual({ type: "takeSeat", deckId: "deck-1" });
  });

  it("reconnects with growing backoff, and resets it after a successful open", () => {
    const { room, sockets, timers } = harness();
    (sockets[0] as FakeSocket).drop(1006);
    expect(room.getState().status).toBe("reconnecting");
    expect(timers[0]?.ms).toBe(BACKOFF_MS[0]);
    timers[0]?.fn();
    (sockets[1] as FakeSocket).drop(1006);
    expect(timers[1]?.ms).toBe(BACKOFF_MS[1]);
    timers[1]?.fn();
    (sockets[2] as FakeSocket).open();
    expect(room.getState().status).toBe("open");
    (sockets[2] as FakeSocket).drop(1006);
    expect(timers[2]?.ms).toBe(BACKOFF_MS[0]);
  });

  it("does not reconnect after Room full or after the player leaves", () => {
    const full = harness();
    (full.sockets[0] as FakeSocket).drop(CLOSE_ROOM_FULL);
    expect(full.room.getState().status).toBe("closed");
    expect(full.timers).toHaveLength(0);

    const left = harness();
    left.room.close();
    (left.sockets[0] as FakeSocket).drop(1000);
    expect(left.timers).toHaveLength(0);
  });

  it("builds ws and wss URLs from the page origin", () => {
    expect(roomSocketUrl("ABC234", "http://localhost:5173")).toBe(
      "ws://localhost:5173/api/rooms/ABC234/ws",
    );
    expect(roomSocketUrl("ABC234", "https://duel.example")).toBe(
      "wss://duel.example/api/rooms/ABC234/ws",
    );
  });
});
