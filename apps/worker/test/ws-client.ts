import { SELF } from "cloudflare:test";
import type {
  Action,
  ClientMessage,
  LegalAction,
  LobbyInfo,
  SeatView,
  ServerMessage,
} from "@card-duel/engine";
import { expect } from "vitest";

export const BASE = "https://card-duel.test";

/** A test WebSocket client that queues server messages. */
export class TestSocket {
  private queue: ServerMessage[] = [];
  private waiters: Array<(m: ServerMessage) => void> = [];
  closed: { code: number } | null = null;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.queue.push(message);
    });
    ws.addEventListener("close", (event) => {
      this.closed = { code: event.code };
    });
  }

  static async open(code: string, cookie: string): Promise<TestSocket> {
    const res = await SELF.fetch(`${BASE}/api/rooms/${code}/ws`, {
      headers: { Upgrade: "websocket", ...(cookie ? { Cookie: cookie } : {}) },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("No WebSocket on the response");
    ws.accept();
    return new TestSocket(ws);
  }

  next(timeoutMs = 2000): Promise<ServerMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for a message")),
        timeoutMs,
      );
      this.waiters.push((m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
  }

  async nextView(): Promise<{
    view: SeatView;
    events: Extract<ServerMessage, { type: "view" }>["events"];
  }> {
    const message = await this.next();
    if (message.type !== "view") expect.fail(`Expected a view, got ${JSON.stringify(message)}`);
    return message;
  }

  async nextLobby(): Promise<LobbyInfo> {
    const message = await this.next();
    if (message.type !== "lobby") expect.fail(`Expected a lobby, got ${JSON.stringify(message)}`);
    return message.lobby;
  }

  send(actionCount: number, action: Action): void {
    this.ws.send(JSON.stringify({ type: "action", actionCount, action } satisfies ClientMessage));
  }

  takeSeat(deckId: string): void {
    this.ws.send(JSON.stringify({ type: "takeSeat", deckId } satisfies ClientMessage));
  }

  close(): void {
    this.ws.close(1000, "done");
  }
}

let players = 0;

/** Signs up a new account and returns its session cookie. */
export async function newPlayer(): Promise<string> {
  players += 1;
  const res = await SELF.fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: `seat_${players}_${Math.random().toString(36).slice(2, 7)}`,
      password: "take a seat",
    }),
  });
  return (res.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
}

async function deckRequest(cookie: string, path: string, body: unknown): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/decks${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return ((await res.json()) as { deck: { id: string } }).deck.id;
}

/** Copies a Starter Deck (a Competitive Deck) for the account. */
export function starterDeck(cookie: string, faction: "swarm" | "court"): Promise<string> {
  return deckRequest(cookie, "/copy-starter", { faction });
}

/** Saves an arbitrary Deck for the account. */
export function savedDeck(
  cookie: string,
  deck: { faction: "swarm" | "court"; leader?: string; cards: string[] },
) {
  return deckRequest(cookie, "", { ...deck, name: "Test Deck" });
}

export async function createRoom(cookie: string, competitive = false): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ competitive }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

/** A Pending Choice option, else the first play, else Pass. */
export function firstPlay(view: SeatView): Action {
  const pick = (a: LegalAction) => {
    const { preview: _preview, ...action } = a as LegalAction & { preview?: unknown };
    return action as Action;
  };
  const choose = view.legalActions.find((a) => a.type === "choose");
  if (choose) return pick(choose);
  const play = view.legalActions.find((a) => a.type === "play");
  return play ? pick(play) : { type: "pass" };
}
