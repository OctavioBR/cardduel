import { SELF } from "cloudflare:test";
import {
  CURRENT_CATALOG_VERSION,
  checkCompetitiveDeck,
  checkValidDeck,
  getCatalog,
  starterDeckOf,
} from "@card-duel/catalog";
import type {
  Action,
  ClientMessage,
  LegalAction,
  LobbyInfo,
  MatchmakingMessage,
  QueueId,
  SeatView,
  ServerMessage,
} from "@card-duel/engine";
import { expect } from "vitest";
import { newIdentity } from "./identity";

export const BASE = "https://card-duel.test";

/** A test WebSocket client that queues server messages. */
export class TestSocket {
  private queue: ServerMessage[] = [];
  private waiters: Array<(m: ServerMessage) => void> = [];
  closed: { code: number } | null = null;

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      if (message.type === "presence") return;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.queue.push(message);
    });
    ws.addEventListener("close", (event) => {
      this.closed = { code: event.code };
    });
  }

  static open(code: string, cookie: string): Promise<TestSocket> {
    return TestSocket.connect(`/api/rooms/${code}/ws`, cookie);
  }

  /** Joins a Queue with one of the account's Decks; read its messages with `nextQueue`. */
  static queue(cookie: string, queue: QueueId, deckId: string): Promise<TestSocket> {
    return TestSocket.connect(
      `/api/matchmaking/ws?queue=${queue}&deck=${encodeURIComponent(deckId)}`,
      cookie,
    );
  }

  private static async connect(path: string, cookie: string): Promise<TestSocket> {
    const res = await SELF.fetch(`${BASE}${path}`, {
      headers: { Upgrade: "websocket", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
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

  async nextView(): Promise<Extract<ServerMessage, { type: "view" }>> {
    const message = await this.next();
    if (message.type !== "view") expect.fail(`Expected a view, got ${JSON.stringify(message)}`);
    return message;
  }

  async nextQueue(): Promise<MatchmakingMessage> {
    return (await this.next()) as unknown as MatchmakingMessage;
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

export const newPlayer = newIdentity;

async function deckRequest(cookie: string, path: string, body: unknown): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/decks${path}`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return ((await res.json()) as { deck: { id: string } }).deck.id;
}

/** Copies a Starter Deck (a Valid Deck, not necessarily a Competitive Deck) for the account. */
export function starterDeck(cookie: string, faction: "swarm" | "court"): Promise<string> {
  return deckRequest(cookie, "/copy-starter", { faction });
}

/**
 * A Competitive Deck for tests: the Faction's current Starter Deck (which need not be
 * a Competitive Deck) minus cards over the Competitive limits, refilled with plain
 * Faction Units so it stays a Valid Deck.
 */
function competitiveDeckSpec(faction: "swarm" | "court") {
  if (!CURRENT_CATALOG_VERSION) throw new Error("No catalog version");
  const catalog = getCatalog(CURRENT_CATALOG_VERSION);
  const { leader, cards } = starterDeckOf(catalog, faction);
  const limits = catalog.limits.competitive;
  const counts = { special: 0, medic: 0, spy: 0 };
  const kept = cards.filter((id) => {
    const card = catalog.byId.get(id);
    if (card?.kind === "special") return ++counts.special <= limits.maxSpecials;
    if (card?.kind !== "unit") return true;
    if (card.abilities.includes("medic")) return ++counts.medic <= limits.maxMedics;
    if (card.abilities.includes("spy")) return ++counts.spy <= limits.maxSpies;
    return true;
  });
  const plain = catalog.cards.filter(
    (c) =>
      c.faction === faction &&
      c.kind === "unit" &&
      !c.abilities.some((a) => a === "medic" || a === "spy"),
  );
  const tooFew = () =>
    checkValidDeck({ faction, leader, cards: kept }, catalog).some(
      (p) => p.code === "too_few_units",
    );
  for (const card of plain) {
    while (tooFew() && kept.filter((id) => id === card.id).length < card.maxCopies)
      kept.push(card.id);
  }
  const deck = { faction, leader, cards: kept };
  const problems = [...checkValidDeck(deck, catalog), ...checkCompetitiveDeck(deck, catalog)];
  if (problems.length > 0) throw new Error(`Not a Competitive Deck: ${problems[0]?.message}`);
  return deck;
}

/** Saves a Competitive Deck built from the Faction's Starter Deck. */
export function competitiveDeck(cookie: string, faction: "swarm" | "court"): Promise<string> {
  return savedDeck(cookie, competitiveDeckSpec(faction));
}

/** Saves an arbitrary Deck for the account. */
export function savedDeck(
  cookie: string,
  deck: { faction: "swarm" | "court"; leader?: string; cards: string[] },
) {
  return deckRequest(cookie, "", { ...deck, name: "Test Deck" });
}

export async function createRoom(
  cookie: string,
  competitive = false,
  turnTimer: number | null = null,
): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify({ competitive, turnTimer }),
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
