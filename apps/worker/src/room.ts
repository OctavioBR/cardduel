import { DurableObject } from "cloudflare:workers";
import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import {
  applyAction,
  CLOSE_ROOM_FULL,
  type ClientMessage,
  createMatch,
  filterEvents,
  type LoggedAction,
  type MatchEvent,
  type MatchSetup,
  type MatchState,
  replay,
  SEATS,
  type Seat,
  type ServerMessage,
  viewFor,
  withoutPreview,
} from "@card-duel/engine";

interface Attachment {
  seat: Seat;
  token: string;
}

interface StoredMatch {
  setup: MatchSetup;
  log: LoggedAction[];
}

/**
 * One Room per shareable code (ADR-0002). The Match is stored as seed plus action log with a
 * cached snapshot (ADR-0003). WebSockets use the Hibernation API, so the object can be evicted
 * between moves while sockets stay open.
 */
export class Room extends DurableObject<Env> {
  private loaded = false;
  private code = "";
  private seats: [string | null, string | null] = [null, null];
  private match: (StoredMatch & { state: MatchState }) | null = null;

  /** Marks the Room as created. Returns false if the code is already in use. */
  async create(code: string): Promise<boolean> {
    if (await this.ctx.storage.get<string>("code")) return false;
    await this.ctx.storage.put({ code, createdAt: Date.now() });
    return true;
  }

  override async fetch(request: Request): Promise<Response> {
    await this.load();
    if (!this.code) return new Response("Room not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const seat = await this.seatFor(token);
    if (seat === null) {
      // No token, or both Seats taken: accepted only to say why, then closed.
      server.accept();
      send(server, { type: "error", code: "room_full", message: "Room full" });
      server.close(CLOSE_ROOM_FULL, "Room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    // A reconnect replaces the Seat's older socket.
    for (const ws of this.ctx.getWebSockets(seatTag(seat)))
      ws.close(1000, "Replaced by a new connection");
    this.ctx.acceptWebSocket(server, [seatTag(seat)]);
    server.serializeAttachment({ seat, token } satisfies Attachment);

    if (!this.match && this.seats[0] && this.seats[1]) {
      await this.startMatch();
    } else {
      this.sendCurrent(server, seat);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.load();
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    const { seat } = attachment;
    const message = parseClientMessage(raw);
    if (!message) {
      send(ws, { type: "error", code: "bad_message", message: "Unreadable message." });
      return;
    }
    if (!this.match) {
      send(ws, { type: "error", code: "not_started", message: "The Match has not started." });
      return;
    }
    const { state } = this.match;
    if (message.actionCount !== state.actionCount) {
      send(ws, {
        type: "error",
        code: "stale_action",
        message: "That action was based on an outdated view.",
      });
      this.sendCurrent(ws, seat);
      return;
    }
    // Clients may echo an action with its Play Preview attached; only the action is logged.
    const action = withoutPreview(message.action);
    const result = applyAction(state, seat, action);
    if (!result.ok) {
      send(ws, { type: "error", code: "rejected", message: result.rejection.message });
      return;
    }
    this.match.log.push({ seat, action });
    this.match.state = result.state;
    await this.ctx.storage.put({ log: this.match.log, snapshot: result.state });
    this.broadcast(result.events);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    // Disconnect grace and Claim win arrive in Milestone 7.
    try {
      ws.close(code === 1005 ? 1000 : code, "Closed");
    } catch {
      // Already closed.
    }
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get(["code", "seats", "setup", "log", "snapshot"]);
    this.code = (stored.get("code") as string | undefined) ?? "";
    this.seats = (stored.get("seats") as [string | null, string | null] | undefined) ?? [
      null,
      null,
    ];
    const setup = stored.get("setup") as MatchSetup | undefined;
    if (setup) {
      const log = (stored.get("log") as LoggedAction[] | undefined) ?? [];
      let snapshot = stored.get("snapshot") as MatchState | undefined;
      // The snapshot is a cache: rebuild from seed plus log when it is missing or behind.
      if (!snapshot || snapshot.actionCount !== log.length) snapshot = replay(setup, log);
      this.match = { setup, log, state: snapshot };
    }
    this.loaded = true;
  }

  private async seatFor(token: string): Promise<Seat | null> {
    if (!token) return null;
    const existing = this.seats.indexOf(token);
    if (existing === 0 || existing === 1) return existing;
    const free = this.seats.indexOf(null);
    if (free !== 0 && free !== 1) return null;
    this.seats[free] = token;
    await this.ctx.storage.put("seats", this.seats);
    return free;
  }

  private async startMatch(): Promise<void> {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    // Hard-coded plain-Unit Decks until accounts and real Decks exist (Milestone 6).
    const setup: MatchSetup = {
      seed,
      decks: [devPlainDeck("swarm"), devPlainDeck("court")],
      cards: DEV_PLAIN_CARDS,
    };
    const { state, events } = createMatch(setup);
    this.match = { setup, log: [], state };
    await this.ctx.storage.put({ setup, log: [], snapshot: state });
    this.broadcast(events);
  }

  private broadcast(events: MatchEvent[]): void {
    if (!this.match) return;
    for (const seat of SEATS) {
      const message: ServerMessage = {
        type: "view",
        view: viewFor(this.match.state, seat),
        events: filterEvents(events, seat),
      };
      for (const ws of this.ctx.getWebSockets(seatTag(seat))) send(ws, message);
    }
  }

  /** A (re)connecting Seat gets just the view, without events. */
  private sendCurrent(ws: WebSocket, seat: Seat): void {
    if (this.match) {
      send(ws, { type: "view", view: viewFor(this.match.state, seat), events: [] });
    } else {
      send(ws, { type: "waiting", seat, code: this.code });
    }
  }
}

function seatTag(seat: Seat): string {
  return `seat:${seat}`;
}

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket closed between lookup and send; the client will reconnect.
  }
}

function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as Partial<ClientMessage>;
    if (
      value?.type === "action" &&
      typeof value.actionCount === "number" &&
      value.action &&
      typeof value.action === "object" &&
      typeof (value.action as { type?: unknown }).type === "string"
    ) {
      return value as ClientMessage;
    }
  } catch {
    // Fall through.
  }
  return null;
}
