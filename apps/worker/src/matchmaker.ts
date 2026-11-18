import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_QUEUE_REFUSED,
  type MatchmakingErrorCode,
  type MatchmakingMessage,
  type QueueId,
} from "@card-duel/engine";
import { ACCOUNT_ID_HEADER, DISPLAY_NAME_HEADER } from "./headers";
import type { SeatState } from "./room";
import { generateRoomCode } from "./room-code";
import { commitDeck, rememberLastDeck } from "./seat-deck";
import copy from "./strings/en.json";

/** The one global Matchmaker instance (#108). */
export const MATCHMAKER_NAME = "global";
/** How long a player whose Matched Room closed keeps their place at the front of the Queue. */
export const QUEUE_PRIORITY_MS = 5 * 60 * 1000;

const QUEUES: readonly QueueId[] = ["casual", "competitive"];

/** Kept on each waiting socket, so it survives hibernation. */
interface Waiting {
  accountId: string;
  /** Matches the stored entry; a newer search by the same account replaces it. */
  entry: string;
  queue: QueueId;
  joinedAt: number;
  /** Back at the front of the Queue after a Matched Room closed with no Match. */
  front: boolean;
}

/** Stored per account: the Seat committed on joining, too large for a socket attachment. */
interface Entry {
  entry: string;
  seat: SeatState;
}

/**
 * Holds players waiting in the Casual and Competitive Queues over hibernating WebSockets and
 * pairs them first in, first out (#108). A pair gets a new Matched Room with both Seats
 * taken; the Matchmaker pushes its code to both and closes their sockets. Closing a socket
 * leaves the Queue.
 */
export class Matchmaker extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const accountId = request.headers.get(ACCOUNT_ID_HEADER) ?? "";
    const displayName = decodeURIComponent(request.headers.get(DISPLAY_NAME_HEADER) ?? "");
    const url = new URL(request.url);
    const queue = url.searchParams.get("queue") as QueueId | null;
    const deckId = url.searchParams.get("deck") ?? "";
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const refuse = (code: MatchmakingErrorCode, message: string) => {
      server.accept();
      send(server, { type: "error", code, message });
      // The message went first; close reasons are limited to 123 bytes.
      server.close(CLOSE_QUEUE_REFUSED, "Not queued");
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!accountId) return refuse("signed_out", copy.signInFirst);
    if (!queue || !QUEUES.includes(queue)) return refuse("bad_request", copy.chooseAQueue);
    if (!deckId) return refuse("bad_request", copy.chooseADeckToQueue);
    const committed = await commitDeck(
      this.env.DB,
      accountId,
      deckId,
      queue === "competitive" ? "queue" : null,
    );
    if (!committed.ok) return refuse("invalid_deck", committed.message);
    await rememberLastDeck(this.env.DB, accountId, deckId);

    // One search per account: a newer one replaces any older one, in either Queue.
    for (const ws of this.ctx.getWebSockets()) {
      if (waitingOf(ws)?.accountId !== accountId) continue;
      send(ws, { type: "error", code: "replaced", message: copy.replacedBySearch });
      ws.close(CLOSE_QUEUE_REFUSED, copy.replacedBySearch);
    }
    const now = Date.now();
    const front = await this.takePriority(accountId, now);
    const entry: Entry = {
      entry: crypto.randomUUID(),
      seat: {
        accountId,
        displayName,
        deck: committed.deck,
        deckName: committed.name,
        lastDeckId: deckId,
      },
    };
    await this.ctx.storage.put(entryKey(accountId), entry);
    this.ctx.acceptWebSocket(server, [queue]);
    server.serializeAttachment({
      accountId,
      entry: entry.entry,
      queue,
      joinedAt: now,
      front,
    } satisfies Waiting);
    send(server, { type: "searching", queue, since: now, serverNow: now });
    await this.pairPlayers(queue);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Puts a player back at the front of the Queue for their next search (Find another Match). */
  async grantPriority(accountId: string): Promise<void> {
    const now = Date.now();
    const priority = await this.priorities(now);
    priority[accountId] = now + QUEUE_PRIORITY_MS;
    await this.ctx.storage.put("priority", priority);
  }

  override async webSocketMessage(): Promise<void> {
    // Players only wait; there is nothing to send.
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const waiting = waitingOf(ws);
    if (waiting) {
      const key = entryKey(waiting.accountId);
      const stored = await this.ctx.storage.get<Entry>(key);
      if (stored?.entry === waiting.entry) await this.ctx.storage.delete(key);
    }
    try {
      ws.close(code === 1005 ? 1000 : code, "Left the Queue");
    } catch {
      // Already closed.
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011);
  }

  /** Pairs waiting players in order, front first; never an account with itself. */
  private async pairPlayers(queue: QueueId): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      for (;;) {
        const waiting = this.ctx
          .getWebSockets(queue)
          .filter((ws) => ws.readyState === WebSocket.OPEN)
          .flatMap((ws) => {
            const w = waitingOf(ws);
            return w ? [{ ws, ...w }] : [];
          })
          .sort((a, b) => Number(b.front) - Number(a.front) || a.joinedAt - b.joinedAt);
        const first = waiting[0];
        const second = waiting.find((w) => w.accountId !== first?.accountId);
        if (!first || !second) return;
        const players = [first, second] as const;
        const entries = await Promise.all(
          players.map((w) => this.ctx.storage.get<Entry>(entryKey(w.accountId))),
        );
        const stale = players.filter((w, i) => entries[i]?.entry !== w.entry);
        if (stale.length > 0) {
          for (const w of stale) w.ws.close(CLOSE_QUEUE_REFUSED, copy.replacedBySearch);
          continue;
        }
        const seats = entries.map((e) => (e as Entry).seat) as [SeatState, SeatState];
        let code: string | null = null;
        for (let attempt = 0; attempt < 5 && !code; attempt++) {
          const candidate = generateRoomCode();
          if (
            await this.env.ROOMS.getByName(candidate).createMatched(
              candidate,
              queue === "competitive",
              seats,
            )
          )
            code = candidate;
        }
        // No free code: both keep waiting and are paired on the next search.
        if (!code) return;
        await this.ctx.storage.delete(players.map((w) => entryKey(w.accountId)));
        for (const w of players) {
          send(w.ws, { type: "matched", code });
          w.ws.close(1000, "Matched");
        }
      }
    });
  }

  /** Whether the account was granted the front of the Queue; the grant is used up. */
  private async takePriority(accountId: string, now: number): Promise<boolean> {
    const priority = await this.priorities(now);
    const granted = accountId in priority;
    delete priority[accountId];
    await this.ctx.storage.put("priority", priority);
    return granted;
  }

  /** Unexpired grants to the front of the Queue, by account. */
  private async priorities(now: number): Promise<Record<string, number>> {
    const stored = (await this.ctx.storage.get<Record<string, number>>("priority")) ?? {};
    return Object.fromEntries(Object.entries(stored).filter(([, until]) => until > now));
  }
}

function entryKey(accountId: string): string {
  return `entry:${accountId}`;
}

function waitingOf(ws: WebSocket): Waiting | null {
  return (ws.deserializeAttachment() as Waiting | null) ?? null;
}

function send(ws: WebSocket, message: MatchmakingMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket closed between lookup and send.
  }
}
