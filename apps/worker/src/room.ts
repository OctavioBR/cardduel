import { DurableObject } from "cloudflare:workers";
import {
  CURRENT_CATALOG_VERSION,
  checkCompetitiveDeck,
  checkValidDeck,
  getCatalog,
} from "@card-duel/catalog";
import {
  applyAction,
  CLOSE_ROOM_FULL,
  type ClientMessage,
  createMatch,
  type DeckSpec,
  type FactionId,
  filterEvents,
  type LobbyInfo,
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

import { writeMatchResult } from "./results";

/** Headers the Worker sets after checking the session; never taken from the client. */
export const ACCOUNT_ID_HEADER = "X-Card-Duel-Account";
export const USERNAME_HEADER = "X-Card-Duel-Username";

interface Attachment {
  seat: Seat;
  accountId: string;
}

interface SeatState {
  accountId: string;
  username: string;
  /** The committed Deck, copied at seat time (ADR-0004); null until the Seat is taken. */
  deck: DeckSpec | null;
  deckName: string | null;
  lastDeckId?: string;
}

interface RoomMeta {
  code: string;
  competitive: boolean;
}

interface StoredMatch {
  id: string;
  finishedAt?: number;
  setup: MatchSetup;
  catalogVersion: string;
  log: LoggedAction[];
}

/**
 * One Room per shareable code (ADR-0002). Two Seats, each held by a signed-in account; a
 * player takes their Seat by committing a Valid Deck (a Competitive Deck in a Competitive
 * Room). The Match is stored as seed plus action log with a cached snapshot (ADR-0003).
 */
export class Room extends DurableObject<Env> {
  private loaded = false;
  private rematch: { accepted: [boolean, boolean]; declined: boolean } = {
    accepted: [false, false],
    declined: false,
  };
  private meta: RoomMeta | null = null;
  private seats: [SeatState | null, SeatState | null] = [null, null];
  private match: (StoredMatch & { state: MatchState }) | null = null;

  /** Marks the Room as created. Returns false if the code is already in use. */
  async create(code: string, competitive = false): Promise<boolean> {
    if (await this.ctx.storage.get<RoomMeta>("meta")) return false;
    await this.ctx.storage.put({
      meta: { code, competitive } satisfies RoomMeta,
      createdAt: Date.now(),
    });
    return true;
  }

  override async fetch(request: Request): Promise<Response> {
    await this.load();
    await this.persistResult();
    if (!this.meta) return new Response("Room not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const accountId = request.headers.get(ACCOUNT_ID_HEADER) ?? "";
    const username = request.headers.get(USERNAME_HEADER) ?? "";
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const seat = await this.seatFor(accountId, username);
    if (seat === null) {
      // Both Seats belong to other players: accepted only to say why, then closed.
      server.accept();
      send(server, { type: "error", code: "room_full", message: "Room full" });
      server.close(CLOSE_ROOM_FULL, "Room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    // A reconnect replaces the Seat's older socket.
    for (const ws of this.ctx.getWebSockets(seatTag(seat)))
      ws.close(1000, "Replaced by a new connection");
    this.ctx.acceptWebSocket(server, [seatTag(seat)]);
    server.serializeAttachment({ seat, accountId } satisfies Attachment);
    if (this.match) this.sendCurrent(server, seat);
    else this.broadcastLobby();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.load();
    await this.persistResult();
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    const { seat } = attachment;
    const message = parseClientMessage(raw);
    if (!message) {
      send(ws, { type: "error", code: "bad_message", message: "Unreadable message." });
      return;
    }
    if (message.type === "leave") {
      await this.declineRematch();
      return;
    }
    if (message.type === "rematch") {
      await this.acceptRematch(ws, seat);
      return;
    }
    if (message.type === "takeSeat") {
      await this.takeSeat(ws, seat, message.deckId);
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
    if (result.state.phase === "ended") this.match.finishedAt = Date.now();
    await this.ctx.storage.put({
      log: this.match.log,
      snapshot: result.state,
      finishedAt: this.match.finishedAt ?? null,
    });
    await this.persistResult();
    this.broadcast(result.events);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.load();
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (
      attachment &&
      this.ctx.getWebSockets(seatTag(attachment.seat)).every((socket) => socket === ws)
    )
      await this.declineRematch();
    try {
      ws.close(code === 1005 ? 1000 : code, "Closed");
    } catch {
      // Already closed.
    }
  }

  /** Checks the Deck and copies it with the current catalog version (ADR-0004). */
  private async takeSeat(ws: WebSocket, seat: Seat, deckId: string): Promise<void> {
    const holder = this.seats[seat];
    if (this.match || !holder) {
      send(ws, { type: "error", code: "invalid_deck", message: "The Match has already started." });
      return;
    }
    const row = await this.env.DB.prepare(
      "SELECT name, faction, leader, cards FROM decks WHERE id = ? AND account_id = ?",
    )
      .bind(deckId, holder.accountId)
      .first<{ name: string; faction: FactionId; leader: string | null; cards: string }>();
    if (!row) {
      send(ws, { type: "error", code: "invalid_deck", message: "That Deck was not found." });
      return;
    }
    const version = CURRENT_CATALOG_VERSION;
    if (!version) throw new Error("No catalog version");
    const catalog = getCatalog(version);
    const input = {
      faction: row.faction,
      leader: row.leader,
      cards: JSON.parse(row.cards) as string[],
    };
    const problems = checkValidDeck(input, catalog);
    if (problems.length > 0) {
      send(ws, {
        type: "error",
        code: "invalid_deck",
        message: `“${row.name}” is not a Valid Deck: ${problems.map((p) => p.message).join(" ")}`,
      });
      return;
    }
    if (this.meta?.competitive) {
      const competitive = checkCompetitiveDeck(input, catalog);
      if (competitive.length > 0) {
        send(ws, {
          type: "error",
          code: "invalid_deck",
          message: `This is a Competitive Room and “${row.name}” is not a Competitive Deck: ${competitive.map((p) => p.message).join(" ")}`,
        });
        return;
      }
    }
    holder.deck = { faction: input.faction, leader: input.leader as string, cards: input.cards };
    holder.deckName = row.name;
    holder.lastDeckId = deckId;
    await this.ctx.storage.put("seats", this.seats);
    if (this.seats[0]?.deck && this.seats[1]?.deck) await this.startMatch(version);
    else this.broadcastLobby();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get([
      "meta",
      "seats",
      "setup",
      "catalogVersion",
      "log",
      "snapshot",
      "rematch",
      "matchId",
      "finishedAt",
    ]);
    this.rematch = (stored.get("rematch") as typeof this.rematch | undefined) ?? this.rematch;
    this.meta = (stored.get("meta") as RoomMeta | undefined) ?? null;
    this.seats = (stored.get("seats") as [SeatState | null, SeatState | null] | undefined) ?? [
      null,
      null,
    ];
    const setup = stored.get("setup") as MatchSetup | undefined;
    if (setup) {
      const log = (stored.get("log") as LoggedAction[] | undefined) ?? [];
      let snapshot = stored.get("snapshot") as MatchState | undefined;
      // The snapshot is a cache: rebuild from seed plus log when it is missing or behind.
      if (!snapshot || snapshot.actionCount !== log.length) snapshot = replay(setup, log);
      const catalogVersion = (stored.get("catalogVersion") as string | undefined) ?? "";
      const id = (stored.get("matchId") as string | undefined) ?? crypto.randomUUID();
      await this.ctx.storage.put("matchId", id);
      const finishedAt = (stored.get("finishedAt") as number | undefined) ?? undefined;
      this.match = { id, finishedAt, setup, catalogVersion, log, state: snapshot };
    }
    this.loaded = true;
  }

  /** The Seat for an account: its own on reconnect, else a free one, else null (Room full). */
  private async seatFor(accountId: string, username: string): Promise<Seat | null> {
    if (!accountId) return null;
    const existing = this.seats.findIndex((s) => s?.accountId === accountId);
    if (existing === 0 || existing === 1) return existing;
    const free = this.seats.indexOf(null);
    if (free !== 0 && free !== 1) return null;
    this.seats[free] = { accountId, username, deck: null, deckName: null };
    await this.ctx.storage.put("seats", this.seats);
    return free;
  }

  private async startMatch(catalogVersion: string): Promise<void> {
    const [a, b] = this.seats;
    if (!a?.deck || !b?.deck) return;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const setup: MatchSetup = {
      seed,
      decks: [a.deck, b.deck],
      cards: getCatalog(catalogVersion).cards,
    };
    const { state, events } = createMatch(setup);
    const id = crypto.randomUUID();
    this.match = { id, setup, catalogVersion, log: [], state };
    await this.ctx.storage.put({ matchId: id, setup, catalogVersion, log: [], snapshot: state });
    this.broadcast(events);
  }

  /** Also retried on reconnect/message if D1 failed after the final action was saved. */
  private async persistResult(): Promise<void> {
    const match = this.match;
    const [a, b] = this.seats;
    if (!match?.state.result || !a || !b) return;
    await writeMatchResult(this.env.DB, {
      id: match.id,
      roomCode: this.meta?.code ?? "",
      players: [a.accountId, b.accountId],
      setup: match.setup,
      catalogVersion: match.catalogVersion,
      log: match.log,
      result: match.state.result,
      finishedAt: match.finishedAt ?? Date.now(),
    });
  }

  private lobbyFor(seat: Seat): LobbyInfo {
    const mine = this.seats[seat];
    const theirs = this.seats[seat === 0 ? 1 : 0];
    return {
      code: this.meta?.code ?? "",
      competitive: this.meta?.competitive ?? false,
      seat,
      you: {
        seated: !!mine?.deck,
        deckName: mine?.deckName ?? null,
        lastDeckId: mine?.lastDeckId ?? null,
      },
      opponent: { present: !!theirs, seated: !!theirs?.deck, username: theirs?.username ?? null },
    };
  }

  private async acceptRematch(ws: WebSocket, seat: Seat): Promise<void> {
    if (this.match?.state.phase !== "ended" || this.rematch.declined) {
      send(ws, { type: "error", code: "rejected", message: "Rematch is unavailable." });
      return;
    }
    this.rematch.accepted[seat] = true;
    if (this.rematch.accepted.every(Boolean)) {
      this.match = null;
      for (const holder of this.seats)
        if (holder) {
          holder.deck = null;
          holder.deckName = null;
        }
      this.rematch = { accepted: [false, false], declined: false };
      await this.ctx.storage.transaction(async (storage) => {
        await storage.delete(["setup", "catalogVersion", "log", "snapshot"]);
        await storage.put({ seats: this.seats, rematch: this.rematch });
      });
      this.broadcastLobby();
    } else {
      await this.ctx.storage.put("rematch", this.rematch);
      this.broadcastRematch();
    }
  }

  private async declineRematch(): Promise<void> {
    if (this.match?.state.phase !== "ended") return;
    this.rematch = { accepted: [false, false], declined: true };
    await this.ctx.storage.put("rematch", this.rematch);
    this.broadcastRematch();
  }

  private broadcastRematch(): void {
    for (const seat of SEATS)
      for (const ws of this.ctx.getWebSockets(seatTag(seat))) this.sendRematch(ws, seat);
  }

  private sendRematch(ws: WebSocket, seat: Seat): void {
    send(ws, {
      type: "rematch",
      accepted: this.rematch.accepted[seat],
      opponentAccepted: this.rematch.accepted[seat === 0 ? 1 : 0],
      declined: this.rematch.declined,
    });
  }

  private broadcastLobby(): void {
    for (const seat of SEATS) {
      for (const ws of this.ctx.getWebSockets(seatTag(seat)))
        send(ws, { type: "lobby", lobby: this.lobbyFor(seat) });
    }
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
    if (this.match) send(ws, { type: "view", view: viewFor(this.match.state, seat), events: [] });
    else send(ws, { type: "lobby", lobby: this.lobbyFor(seat) });
    if (this.match?.state.phase === "ended") this.sendRematch(ws, seat);
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
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value?.type === "rematch" || value?.type === "leave") return { type: value.type };
    if (value?.type === "takeSeat" && typeof value.deckId === "string") {
      return { type: "takeSeat", deckId: value.deckId };
    }
    if (
      value?.type === "action" &&
      typeof value.actionCount === "number" &&
      value.action &&
      typeof value.action === "object" &&
      typeof (value.action as { type?: unknown }).type === "string"
    ) {
      return value as unknown as ClientMessage;
    }
  } catch {
    // Fall through.
  }
  return null;
}
