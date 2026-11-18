import { describe, expect, it } from "vitest";
import { clock } from "./clock";
import { QueueSearch, type SearchState, searchSeconds } from "./queue-search";

class FakeSocket extends EventTarget {
  closed = false;
  constructor(readonly url: string) {
    super();
  }
  close() {
    this.closed = true;
  }
  receive(message: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
  drop() {
    this.dispatchEvent(new Event("close"));
  }
}

function harness() {
  const states: SearchState[] = [];
  const matched: string[] = [];
  let socket: FakeSocket | null = null;
  const search = new QueueSearch("competitive", "deck 1", {
    origin: "https://cardduel.test",
    onChange: (s) => states.push(s),
    onMatched: (code) => matched.push(code),
    createSocket: (url) => {
      socket = new FakeSocket(url);
      return socket as unknown as WebSocket;
    },
    now: () => 10_000,
  });
  return { search, states, matched, socket: socket as unknown as FakeSocket };
}

describe("Find a Match", () => {
  it("joins the chosen Queue with the Deck, over wss on an https page", () => {
    const { socket, states } = harness();
    expect(socket.url).toBe("wss://cardduel.test/api/matchmaking/ws?queue=competitive&deck=deck+1");
    expect(states).toEqual([{ status: "connecting", queue: "competitive" }]);
  });

  it("counts the wait from the server's clock and hands over the Room code", () => {
    const { socket, states, matched } = harness();
    socket.receive({ type: "searching", queue: "competitive", since: 500, serverNow: 2_500 });
    const searching = states.at(-1);
    if (searching?.status !== "searching") expect.fail("Expected to be searching");
    expect(clock(searchSeconds(searching, 50_000))).toBe("0:42");
    socket.receive({ type: "matched", code: "ABC234" });
    socket.drop();
    expect(matched).toEqual(["ABC234"]);
    expect(states.at(-1)?.status).toBe("searching");
  });

  it("reports why the search stopped, and Cancel leaves the Queue quietly", () => {
    const refused = harness();
    refused.socket.receive({ type: "error", code: "invalid_deck", message: "Not this Deck." });
    refused.socket.drop();
    expect(refused.states.at(-1)).toEqual({ status: "failed", message: "Not this Deck." });

    const cancelled = harness();
    cancelled.search.cancel();
    cancelled.socket.drop();
    expect(cancelled.socket.closed).toBe(true);
    expect(cancelled.states.at(-1)).toEqual({ status: "idle" });
  });

  it("formats minutes and seconds", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(120)).toBe("2:00");
    expect(clock(725)).toBe("12:05");
  });
});
