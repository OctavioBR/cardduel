import { DurableObject } from "cloudflare:workers";
import { CURRENT_CATALOG_VERSION, getCatalog } from "@card-duel/catalog";
import {
  type Action,
  type ApplyResult,
  applyAction,
  CLOSE_NO_MATCH,
  CLOSE_ROOM_FULL,
  CLOSE_ROOM_NOT_FOUND,
  type ClientMessage,
  createMatch,
  DEFAULT_TURN_TIMER_SECONDS,
  type DeckSpec,
  filterEvents,
  type LobbyInfo,
  type LoggedAction,
  type MatchEvent,
  type MatchResult,
  type MatchSetup,
  type MatchState,
  opponent,
  replay,
  SEATS,
  type Seat,
  type ServerMessage,
  type TurnTimerInfo,
  timedOutAction,
  viewFor,
  waitingOn,
  withoutPreview,
} from "@card-duel/engine";
import { activityIsStale, recordActivity } from "./activity";
import { ACCOUNT_ID_HEADER, DISPLAY_NAME_HEADER } from "./headers";
import { MATCHMAKER_NAME } from "./matchmaker";
import { writeMatchResult } from "./results";
import { commitDeck, rememberLastDeck } from "./seat-deck";
import copy from "./strings/en.json";

export const DISCONNECT_GRACE_MS = 2 * 60 * 1000;
export const ROOM_IDLE_MS = 24 * 60 * 60 * 1000;
/** How long both players of a Matched Room have to connect before it closes with no Match. */
export const MATCHED_ROOM_CONNECT_MS = 30 * 1000;
export { ACCOUNT_ID_HEADER, DEFAULT_TURN_TIMER_SECONDS, DISPLAY_NAME_HEADER };

interface Attachment {
  seat: Seat;
  accountId: string;
}

export interface SeatState {
  accountId: string;
  displayName: string;
  /** The committed Deck, copied at seat time (ADR-0004); null until the Seat is taken. */
  deck: DeckSpec | null;
  deckName: string | null;
  lastDeckId?: string;
}

interface RoomMeta {
  managedAuth?: true;
  code: string;
  competitive: boolean;
  /** Turn Timer length in seconds, fixed for the Room's life; absent or null: none. */
  turnTimer?: number | null;
  /** A Matched Room (GLOSSARY.md), created by the Matchmaker. */
  matched?: true;
  /** A Matched Room closes with no Match unless both players connect by then. */
  connectBy?: number;
}

/** When each Seat's Turn Timer runs out (server time), or null when it is not running. */
type Deadlines = [number | null, number | null];

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
  private lastActivityAt = 0;
  /** When each account's activity was last written; forgotten on hibernation, which is safe. */
  private activityRecordedAt = new Map<string, number>();
  private disconnectedAt: [number | null, number | null] = [null, null];
  private rematch: { accepted: [boolean, boolean]; declined: boolean } = {
    accepted: [false, false],
    declined: false,
  };
  private meta: RoomMeta | null = null;
  private seats: [SeatState | null, SeatState | null] = [null, null];
  private match: (StoredMatch & { state: MatchState }) | null = null;
  private turnDeadlines: Deadlines = [null, null];

  /**
   * Marks the Room as created, with its Turn Timer length in seconds (null: none). Returns
   * false if the code is already in use.
   */
  async create(
    code: string,
    competitive = false,
    turnTimer: number | null = null,
  ): Promise<boolean> {
    if (await this.ctx.storage.get<RoomMeta>("meta")) return false;
    await this.ctx.storage.put({
      meta: { code, competitive, turnTimer, managedAuth: true } satisfies RoomMeta,
      createdAt: Date.now(),
    });
    await this.ctx.storage.put("lastActivityAt", Date.now());
    await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS);
    // An instance still in memory after its Room expired must read the new Room.
    this.loaded = false;
    return true;
  }

  /**
   * Creates a Matched Room for two players paired by the Queue, both already seated with the
   * Decks they committed on joining it. The Match starts once both connect. Returns false if
   * the code is already in use.
   */
  async createMatched(
    code: string,
    competitive: boolean,
    seats: [SeatState, SeatState],
  ): Promise<boolean> {
    if (await this.ctx.storage.get<RoomMeta>("meta")) return false;
    const now = Date.now();
    const meta: RoomMeta = {
      code,
      competitive,
      turnTimer: DEFAULT_TURN_TIMER_SECONDS,
      matched: true,
      connectBy: now + MATCHED_ROOM_CONNECT_MS,
      managedAuth: true,
    };
    await this.ctx.storage.put({ meta, seats, createdAt: now, lastActivityAt: now });
    await this.ctx.storage.setAlarm(meta.connectBy as number);
    this.loaded = false;
    return true;
  }

  override async fetch(request: Request): Promise<Response> {
    await this.load();
    await this.persistResult();
    if (!this.meta?.managedAuth) return new Response(copy.roomNotFound, { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response(copy.expectedAWebSocketUpgrade, { status: 426 });
    }
    const accountId = request.headers.get(ACCOUNT_ID_HEADER) ?? "";
    const displayName = decodeURIComponent(request.headers.get(DISPLAY_NAME_HEADER) ?? "");
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const seat = await this.seatFor(accountId, displayName);
    if (seat === null) {
      // Both Seats belong to other players: accepted only to say why, then closed.
      server.accept();
      send(server, { type: "error", code: "room_full", message: copy.roomFull });
      server.close(CLOSE_ROOM_FULL, copy.roomFull);
      return new Response(null, { status: 101, webSocket: client });
    }

    // A reconnect replaces the Seat's older socket.
    for (const ws of this.ctx.getWebSockets(seatTag(seat)))
      ws.close(1000, "Replaced by a new connection");
    this.ctx.acceptWebSocket(server, [seatTag(seat)]);
    server.serializeAttachment({ seat, accountId } satisfies Attachment);
    this.disconnectedAt[seat] = null;
    await this.touch();
    if (this.match) this.sendCurrent(server, seat);
    else if (this.meta.connectBy !== undefined && SEATS.every((s) => this.present(s)))
      await this.startMatch();
    else this.broadcastLobby();
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.load();
    await this.persistResult();
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    const { seat } = attachment;
    if (!this.ctx.getWebSockets(seatTag(seat)).includes(ws) || ws.readyState !== WebSocket.OPEN)
      return;
    await this.touch();
    this.recordPlayersActive();
    const message = parseClientMessage(raw);
    if (!message) {
      send(ws, { type: "error", code: "bad_message", message: copy.unreadableMessage });
      return;
    }
    if (message.type === "claimWin") {
      await this.claimWin(ws, seat);
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
      send(ws, { type: "error", code: "not_started", message: copy.theMatchHasNotStarted });
      return;
    }
    const { state } = this.match;
    if (message.actionCount !== state.actionCount) {
      send(ws, {
        type: "error",
        code: "stale_action",
        message: copy.thatActionWasBasedOnAn,
      });
      this.sendCurrent(ws, seat);
      return;
    }
    // Clients may echo an action with its Play Preview attached; only the action is logged.
    const result = await this.act(seat, withoutPreview(message.action), false);
    if (!result.ok)
      send(ws, { type: "error", code: "rejected", message: result.rejection.message });
  }

  /**
   * Applies, logs and broadcasts one action for a Seat: the player's own, or the one the
   * Room takes for them when their Turn Timer runs out (ADR-0009).
   */
  private async act(seat: Seat, action: Action, timedOut: boolean): Promise<ApplyResult> {
    const match = this.match;
    if (!match) throw new Error("No Match");
    const previous = match.state;
    const result = applyAction(previous, seat, action, { timedOut });
    if (!result.ok) return result;
    match.log.push(timedOut ? { seat, action, timedOut: true } : { seat, action });
    match.state = result.state;
    this.turnDeadlines = this.nextDeadlines(previous, result.state, seat);
    if (result.state.phase === "ended") match.finishedAt = Date.now();
    await this.ctx.storage.put({
      log: match.log,
      snapshot: result.state,
      finishedAt: match.finishedAt ?? null,
      turnDeadlines: this.turnDeadlines,
    });
    await this.persistResult();
    this.broadcast(result.events);
    await this.scheduleAlarm();
    return result;
  }

  /**
   * Each Seat's Turn Timer after an action: it runs while the Match waits on the Seat, and
   * restarts after the Seat acts or when the Match starts waiting on it.
   */
  private nextDeadlines(
    previous: MatchState | null,
    next: MatchState,
    actor: Seat | null,
  ): Deadlines {
    const seconds = this.meta?.turnTimer;
    if (!seconds) return [null, null];
    const restarted = Date.now() + seconds * 1000;
    const deadline = (seat: Seat) => {
      if (!waitingOn(next, seat)) return null;
      if (seat === actor || !previous || !waitingOn(previous, seat)) return restarted;
      return this.turnDeadlines[seat] ?? restarted;
    };
    return [deadline(0), deadline(1)];
  }

  /** Takes the timed-out action for every Seat whose Turn Timer has run out (ADR-0009). */
  private async expireTurnTimers(): Promise<void> {
    // Each expiry restarts or stops that Seat's countdown, so this ends within a few steps.
    for (let step = 0; step < 4; step++) {
      const state = this.match?.state;
      if (!state || state.phase === "ended") return;
      const now = Date.now();
      const seat = SEATS.find((s) => {
        const at = this.turnDeadlines[s];
        return at !== null && at <= now;
      });
      if (seat === undefined) return;
      const action = timedOutAction(state, seat);
      if (action && (await this.act(seat, action, true)).ok) continue;
      this.turnDeadlines[seat] = null;
      await this.ctx.storage.put("turnDeadlines", this.turnDeadlines);
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.load();
    if (!this.meta) return;
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
    if (attachment && !this.present(attachment.seat) && this.match?.state.phase !== "ended") {
      this.disconnectedAt[attachment.seat] ??= Date.now();
      await this.touch();
      this.broadcastPresence();
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011);
  }

  /**
   * Both connected players count as Recently Active Players whenever either sends a message,
   * so the one waiting on the other's Turn stays counted (#119). At most once a minute each.
   */
  private recordPlayersActive(): void {
    const now = Date.now();
    for (const seat of SEATS) {
      const holder = this.seats[seat];
      if (!holder || !this.present(seat)) continue;
      if (!activityIsStale(this.activityRecordedAt.get(holder.accountId) ?? null, now)) continue;
      this.activityRecordedAt.set(holder.accountId, now);
      this.ctx.waitUntil(recordActivity(this.env.DB, holder.accountId, now));
    }
  }

  private present(seat: Seat): boolean {
    return this.ctx.getWebSockets(seatTag(seat)).some((ws) => ws.readyState === WebSocket.OPEN);
  }

  private async touch(): Promise<void> {
    this.lastActivityAt = Date.now();
    await this.ctx.storage.put({
      lastActivityAt: this.lastActivityAt,
      disconnectedAt: this.disconnectedAt,
    });
    await this.scheduleAlarm();
  }

  /** One alarm covers the earliest deadline: Turn Timer, disconnect grace, connect or idle. */
  private async scheduleAlarm(): Promise<void> {
    if (!this.meta) return;
    const now = Date.now();
    const running = this.match && this.match.state.phase !== "ended";
    const deadlines = running
      ? [
          ...this.disconnectedAt.flatMap((at) =>
            at !== null && at + DISCONNECT_GRACE_MS > now ? [at + DISCONNECT_GRACE_MS] : [],
          ),
          ...this.turnDeadlines.filter((at): at is number => at !== null),
        ]
      : [];
    if (!this.match && this.meta.connectBy !== undefined) deadlines.push(this.meta.connectBy);
    await this.ctx.storage.setAlarm(Math.min(this.lastActivityAt + ROOM_IDLE_MS, ...deadlines));
  }

  override async alarm(): Promise<void> {
    await this.load();
    if (!this.meta) return;
    await this.persistResult();
    if (!this.match && this.meta.connectBy !== undefined && Date.now() >= this.meta.connectBy) {
      await this.closeUnmatched();
      return;
    }
    await this.expireTurnTimers();
    if (Date.now() >= this.lastActivityAt + ROOM_IDLE_MS) {
      const present = SEATS.filter((seat) => this.present(seat));
      if (this.match && this.match.state.phase !== "ended" && present.length === 1) {
        await this.finishDisconnect(present[0] as Seat);
      } else if (present.length === 2 && this.match?.state.phase !== "ended") {
        // Two connected players still have their Room; idle expiry only abandons absent players.
        await this.touch();
        return;
      }
      // Neither present means a Void Match: no result is written.
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, "Room expired");
      await this.clear();
      return;
    }
    this.broadcastPresence();
    await this.scheduleAlarm();
  }

  private async clear(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.meta = null;
    this.match = null;
    this.seats = [null, null];
    this.turnDeadlines = [null, null];
  }

  /**
   * A Matched Room whose players did not both connect in time closes with no Match and
   * nothing recorded. A player who did connect goes back to the front of the Queue if they
   * choose Find another Match.
   */
  private async closeUnmatched(): Promise<void> {
    const present = SEATS.filter((seat) => this.present(seat));
    const matchmaker = this.env.MATCHMAKER.getByName(MATCHMAKER_NAME);
    for (const seat of present) {
      const holder = this.seats[seat];
      if (holder) await matchmaker.grantPriority(holder.accountId);
    }
    for (const seat of present)
      for (const ws of this.ctx.getWebSockets(seatTag(seat))) {
        send(ws, { type: "error", code: "no_match", message: copy.opponentDidNotConnect });
        ws.close(CLOSE_NO_MATCH, copy.opponentDidNotConnect);
      }
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(CLOSE_NO_MATCH, copy.opponentDidNotConnect);
      } catch {
        // Already closed.
      }
    }
    await this.clear();
  }

  private async claimWin(ws: WebSocket, seat: Seat): Promise<void> {
    const missing = this.disconnectedAt[seat === 0 ? 1 : 0];
    if (
      !this.match ||
      this.match.state.phase === "ended" ||
      missing === null ||
      Date.now() < missing + DISCONNECT_GRACE_MS ||
      this.present(seat === 0 ? 1 : 0)
    ) {
      send(ws, {
        type: "error",
        code: "rejected",
        message: "A Disconnect Win cannot be claimed yet.",
      });
      return;
    }
    await this.finishDisconnect(seat);
  }

  private async finishDisconnect(winner: Seat): Promise<void> {
    if (!this.match) return;
    const result: MatchResult = { outcome: "win", winner, reason: "disconnect" };
    this.match.finishedAt = Date.now();
    this.match.state = { ...this.match.state, phase: "ended", turn: null, pending: [], result };
    this.turnDeadlines = [null, null];
    await this.ctx.storage.put({
      snapshot: this.match.state,
      externalResult: result,
      finishedAt: this.match.finishedAt,
      turnDeadlines: this.turnDeadlines,
    });
    await this.persistResult();
    this.broadcast([{ type: "matchEnded", result }]);
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    for (const seat of SEATS) {
      const at =
        this.match && this.match.state.phase !== "ended"
          ? this.disconnectedAt[seat === 0 ? 1 : 0]
          : null;
      for (const ws of this.ctx.getWebSockets(seatTag(seat))) {
        send(ws, {
          type: "presence",
          disconnect: {
            claimAt: at === null ? null : at + DISCONNECT_GRACE_MS,
            serverNow: Date.now(),
          },
        });
      }
    }
  }

  /** Checks the Deck and copies it with the current catalog version (ADR-0004). */
  private async takeSeat(ws: WebSocket, seat: Seat, deckId: string): Promise<void> {
    const holder = this.seats[seat];
    if (this.match || !holder) {
      send(ws, { type: "error", code: "invalid_deck", message: copy.theMatchHasAlreadyStarted });
      return;
    }
    const committed = await commitDeck(
      this.env.DB,
      holder.accountId,
      deckId,
      this.meta?.competitive ? "room" : null,
    );
    if (!committed.ok) {
      send(ws, { type: "error", code: "invalid_deck", message: committed.message });
      return;
    }
    // The D1 read let other messages in: the Match may have started meanwhile.
    if (this.match) return;
    holder.deck = committed.deck;
    holder.deckName = committed.name;
    holder.lastDeckId = deckId;
    await this.ctx.storage.put("seats", this.seats);
    if (this.seats[0]?.deck && this.seats[1]?.deck) await this.startMatch();
    else this.broadcastLobby();
    await rememberLastDeck(this.env.DB, holder.accountId, deckId);
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
      "lastActivityAt",
      "disconnectedAt",
      "externalResult",
      "turnDeadlines",
    ]);
    this.rematch = (stored.get("rematch") as typeof this.rematch | undefined) ?? this.rematch;
    this.meta = (stored.get("meta") as RoomMeta | undefined) ?? null;
    // Old accounts are archived, so the authorized cutover ends their existing Rooms.
    // Keep stored data for reference; never write old results into the new account tables.
    if (this.meta && !this.meta.managedAuth) {
      this.meta = null;
      this.loaded = true;
      await this.ctx.storage.deleteAlarm();
      for (const ws of this.ctx.getWebSockets()) {
        send(ws, { type: "error", code: "room_not_found", message: copy.roomUpdated });
        ws.close(CLOSE_ROOM_NOT_FOUND, copy.roomUpdated);
      }
      return;
    }
    this.seats = (stored.get("seats") as [SeatState | null, SeatState | null] | undefined) ?? [
      null,
      null,
    ];
    this.lastActivityAt = (stored.get("lastActivityAt") as number | undefined) ?? Date.now();
    this.disconnectedAt = (stored.get("disconnectedAt") as
      | [number | null, number | null]
      | undefined) ?? [null, null];
    this.turnDeadlines = (stored.get("turnDeadlines") as Deadlines | undefined) ?? [null, null];
    const setup = stored.get("setup") as MatchSetup | undefined;
    if (setup) {
      const log = (stored.get("log") as LoggedAction[] | undefined) ?? [];
      let snapshot = stored.get("snapshot") as MatchState | undefined;
      // The snapshot is a cache: rebuild from seed plus log when it is missing or behind.
      if (!snapshot || snapshot.actionCount !== log.length) snapshot = replay(setup, log);
      const externalResult = stored.get("externalResult") as MatchResult | undefined;
      if (externalResult)
        snapshot = { ...snapshot, phase: "ended", turn: null, pending: [], result: externalResult };
      const catalogVersion = (stored.get("catalogVersion") as string | undefined) ?? "";
      const id = (stored.get("matchId") as string | undefined) ?? crypto.randomUUID();
      await this.ctx.storage.put("matchId", id);
      const finishedAt = (stored.get("finishedAt") as number | undefined) ?? undefined;
      this.match = { id, finishedAt, setup, catalogVersion, log, state: snapshot };
    }
    this.loaded = true;
  }

  /** The Seat for an account: its own on reconnect, else a free one, else null (Room full). */
  private async seatFor(accountId: string, displayName: string): Promise<Seat | null> {
    if (!accountId) return null;
    const existing = this.seats.findIndex((s) => s?.accountId === accountId);
    if (existing === 0 || existing === 1) {
      const seat = this.seats[existing];
      if (seat && seat.displayName !== displayName) {
        seat.displayName = displayName;
        await this.ctx.storage.put("seats", this.seats);
      }
      return existing;
    }
    const free = this.seats.indexOf(null);
    if (free !== 0 && free !== 1) return null;
    this.seats[free] = { accountId, displayName, deck: null, deckName: null };
    await this.ctx.storage.put("seats", this.seats);
    return free;
  }

  private async startMatch(): Promise<void> {
    const [a, b] = this.seats;
    if (this.match || !a?.deck || !b?.deck || !this.meta) return;
    const catalogVersion = CURRENT_CATALOG_VERSION;
    if (!catalogVersion) throw new Error("No catalog version");
    // E2E_SEED is set only by `wrangler dev --var` in the Playwright config, so end-to-end
    // tests get a known deal. No deployed config sets it, so production seeds stay random.
    const fixed = (this.env as { E2E_SEED?: string }).E2E_SEED;
    const seed =
      fixed !== undefined && /^\d+$/.test(fixed)
        ? Number(fixed)
        : (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0);
    const setup: MatchSetup = {
      seed,
      decks: [a.deck, b.deck],
      cards: getCatalog(catalogVersion).cards,
    };
    const { state, events } = createMatch(setup);
    const id = crypto.randomUUID();
    this.match = { id, setup, catalogVersion, log: [], state };
    this.turnDeadlines = this.nextDeadlines(null, state, null);
    // Once a Matched Room's first Match starts, it is an ordinary Room.
    delete this.meta.connectBy;
    await this.ctx.storage.put({
      meta: this.meta,
      matchId: id,
      setup,
      catalogVersion,
      log: [],
      snapshot: state,
      turnDeadlines: this.turnDeadlines,
    });
    this.broadcast(events);
    await this.scheduleAlarm();
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
      matched: this.meta?.matched ?? false,
      turnTimer: this.meta?.turnTimer ?? null,
      seat,
      you: {
        seated: !!mine?.deck,
        deckName: mine?.deckName ?? null,
        lastDeckId: mine?.lastDeckId ?? null,
      },
      opponent: {
        present: !!theirs,
        seated: !!theirs?.deck,
        displayName: theirs?.displayName ?? null,
      },
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
      this.turnDeadlines = [null, null];
      await this.ctx.storage.transaction(async (storage) => {
        await storage.delete([
          "setup",
          "catalogVersion",
          "log",
          "snapshot",
          "externalResult",
          "finishedAt",
          "matchId",
          "turnDeadlines",
        ]);
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
        ...this.turnTimerFor(seat),
      };
      for (const ws of this.ctx.getWebSockets(seatTag(seat))) send(ws, message);
    }
  }

  /** Both players see both countdowns; the server stays the authority. */
  private turnTimerFor(seat: Seat): { turnTimer?: TurnTimerInfo } {
    if (!this.meta?.turnTimer) return {};
    return {
      turnTimer: {
        you: this.turnDeadlines[seat],
        opponent: this.turnDeadlines[opponent(seat)],
        serverNow: Date.now(),
      },
    };
  }

  /** A (re)connecting Seat gets just the view, without events. */
  private sendCurrent(ws: WebSocket, seat: Seat): void {
    if (this.match)
      send(ws, {
        type: "view",
        view: viewFor(this.match.state, seat),
        events: [],
        ...this.turnTimerFor(seat),
      });
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
    if (value?.type === "claimWin") return { type: "claimWin" };
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
