import { env, evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { CURRENT_CATALOG_VERSION } from "@card-duel/catalog";
import {
  CLOSE_ROOM_FULL,
  CLOSE_SIGNED_OUT,
  type LoggedAction,
  type MatchEvent,
  type MatchState,
  type SeatView,
  type TurnTimerInfo,
} from "@card-duel/engine";
import { describe, expect, it, vi } from "vitest";
import { DISCONNECT_GRACE_MS, ROOM_IDLE_MS } from "../src/room";
import { ROOM_CODE_ALPHABET } from "../src/room-code";
import {
  BASE,
  createRoom,
  firstPlay,
  newPlayer,
  savedDeck,
  starterDeck,
  TestSocket,
} from "./ws-client";

interface Seated {
  code: string;
  cookies: [string, string];
  sockets: [TestSocket, TestSocket];
  views: [SeatView, SeatView];
  /** The Turn Timer deadlines each Seat last received. */
  timers?: [TurnTimerInfo | undefined, TurnTimerInfo | undefined];
  /** The events each Seat last received. */
  events?: [MatchEvent[], MatchEvent[]];
}

/**
 * Two accounts take Seats with their Starter Decks, then both keep their opening hands
 * (unless `redraw` is false, which stops at Redraw).
 */
async function seatBoth(
  competitive = false,
  { turnTimer = null, redraw = true }: { turnTimer?: number | null; redraw?: boolean } = {},
): Promise<Seated> {
  const cookies: [string, string] = [await newPlayer(), await newPlayer()];
  const decks = [await starterDeck(cookies[0], "swarm"), await starterDeck(cookies[1], "court")];
  const code = await createRoom(cookies[0], competitive, turnTimer);
  const a = await TestSocket.open(code, cookies[0]);
  expect(await a.nextLobby()).toMatchObject({ code, seat: 0, opponent: { present: false } });
  const b = await TestSocket.open(code, cookies[1]);
  await Promise.all([a.nextLobby(), b.nextLobby()]);
  a.takeSeat(decks[0] as string);
  await Promise.all([a.nextLobby(), b.nextLobby()]);
  b.takeSeat(decks[1] as string);
  const [ma, mb] = await Promise.all([a.nextView(), b.nextView()]);
  const room: Seated = { code, cookies, sockets: [a, b], views: [ma.view, mb.view] };
  room.timers = [ma.turnTimer, mb.turnTimer];
  expect(room.views[0].phase).toBe("redraw");
  if (!redraw) return room;
  await play(room, 0, { type: "confirmRedraw" });
  await play(room, 1, { type: "confirmRedraw" });
  expect(room.views[0].phase).toBe("turns");
  return room;
}

/** Action count once both Seats have confirmed Redraw. */
const START = 2;

function mover(views: [SeatView, SeatView]): 0 | 1 {
  return views[0].turn === "you" ? 0 : 1;
}

async function play(room: Seated, i: 0 | 1, action = firstPlay(room.views[i])): Promise<void> {
  room.sockets[i].send(room.views[i].actionCount, action);
  await nextViews(room);
}

async function nextViews(room: Seated): Promise<void> {
  const [ma, mb] = await Promise.all([room.sockets[0].nextView(), room.sockets[1].nextView()]);
  room.views = [ma.view, mb.view];
  room.timers = [ma.turnTimer, mb.turnTimer];
  room.events = [ma.events, mb.events];
}

function closeAll(room: Seated): void {
  for (const s of room.sockets) s.close();
}

describe("POST /api/rooms", () => {
  it("requires signing in, and returns a 6-character code from the unambiguous alphabet", async () => {
    const signedOut = await SELF.fetch(`${BASE}/api/rooms`, {
      method: "POST",
      headers: { Origin: BASE },
    });
    expect(signedOut.status).toBe(401);
    const code = await createRoom(await newPlayer());
    expect(code).toHaveLength(6);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });

  it("refuses WebSockets to a Room that was never created", async () => {
    const res = await SELF.fetch(`${BASE}/api/rooms/ZZZZZZ/ws`, {
      headers: { Upgrade: "websocket", Origin: BASE, Cookie: await newPlayer() },
    });
    expect(res.status).toBe(404);
  });
});

describe("Room", () => {
  it("the WebSocket requires a signed-in session", async () => {
    const code = await createRoom(await newPlayer());
    const socket = await TestSocket.open(code, "");
    expect(await socket.next()).toMatchObject({ type: "error", code: "signed_out" });
    await new Promise((r) => setTimeout(r, 50));
    expect(socket.closed?.code).toBe(CLOSE_SIGNED_OUT);
  });

  it("two accounts take Seats with real Decks and play to Match end", async () => {
    const room = await seatBoth();
    expect(room.views[0].you.faction).toBe("swarm");
    expect(room.views[1].you.faction).toBe("court");
    for (let guard = 0; room.views[0].phase !== "ended" && guard < 400; guard++) {
      const i = mover(room.views);
      const view = room.views[i];
      const pending = view.legalActions.some((a) => a.type === "choose");
      const action =
        pending || view.you.hand.length > 10 - 2 * view.round
          ? firstPlay(view)
          : { type: "pass" as const };
      await play(room, i, action);
      expect(room.views[0].actionCount).toBe(room.views[1].actionCount);
    }
    expect(room.views[0].phase).toBe("ended");
    expect(room.views[1].result).toEqual(room.views[0].result);
    const rows = await env.DB.prepare("SELECT * FROM match_results WHERE room_code = ?")
      .bind(room.code)
      .all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({
      outcome: room.views[0].result?.outcome,
      ended_by: "gems",
    });
    closeAll(room);
  });

  it("persists a Forfeit and does not duplicate it after eviction and reconnect", async () => {
    const room = await seatBoth();
    await play(room, 0, { type: "forfeit" });
    await evictDurableObject(env.ROOMS.getByName(room.code));
    const again = await TestSocket.open(room.code, room.cookies[0]);
    expect((await again.nextView()).view.phase).toBe("ended");
    const rows = await env.DB.prepare("SELECT * FROM match_results WHERE room_code = ?")
      .bind(room.code)
      .all<{ player0_id: string; player1_id: string }>();
    expect(rows.results).toHaveLength(1);
    const row = rows.results[0];
    expect(
      await env.DB.prepare("SELECT losses FROM records WHERE account_id = ?")
        .bind(row?.player0_id)
        .first(),
    ).toEqual({ losses: 1 });
    expect(
      await env.DB.prepare("SELECT wins FROM records WHERE account_id = ?")
        .bind(row?.player1_id)
        .first(),
    ).toEqual({ wins: 1 });
    again.close();
    closeAll(room);
  });

  it("offers a Rematch, persists acceptance through eviction, and returns both to Deck choice", async () => {
    const room = await seatBoth(true);
    room.sockets[0].ws.send(JSON.stringify({ type: "rematch" }));
    expect(await room.sockets[0].next()).toMatchObject({ type: "error", code: "rejected" });
    await play(room, 0, { type: "forfeit" });
    room.sockets[0].ws.send(JSON.stringify({ type: "rematch" }));
    expect(await room.sockets[0].next()).toMatchObject({ type: "rematch", accepted: true });
    expect(await room.sockets[1].next()).toMatchObject({ type: "rematch", opponentAccepted: true });
    await evictDurableObject(env.ROOMS.getByName(room.code));
    room.sockets[1].ws.send(JSON.stringify({ type: "rematch" }));
    const lobbies = await Promise.all(room.sockets.map((socket) => socket.nextLobby()));
    for (const lobby of lobbies) {
      expect(lobby).toMatchObject({ code: room.code, competitive: true, you: { seated: false } });
      expect(lobby.you.lastDeckId).toBeTypeOf("string");
    }
    await evictDurableObject(env.ROOMS.getByName(room.code));
    const reconnect = await TestSocket.open(room.code, room.cookies[0]);
    expect(await reconnect.nextLobby()).toEqual(lobbies[0]);
    await room.sockets[1].nextLobby();
    room.sockets[0] = reconnect;
    room.sockets[0].takeSeat(lobbies[0]?.you.lastDeckId as string);
    await Promise.all(room.sockets.map((socket) => socket.nextLobby()));
    room.sockets[1].takeSeat(lobbies[1]?.you.lastDeckId as string);
    const next = await Promise.all(room.sockets.map((socket) => socket.nextView()));
    expect(next[0]?.view).toMatchObject({ phase: "redraw", actionCount: 0 });
    closeAll(room);
  });

  it("leaving after a Match declines a Rematch for both players", async () => {
    const room = await seatBoth();
    await play(room, 0, { type: "forfeit" });
    room.sockets[0].ws.send(JSON.stringify({ type: "rematch" }));
    await Promise.all(room.sockets.map((socket) => socket.next()));
    room.sockets[1].ws.send(JSON.stringify({ type: "leave" }));
    for (const message of await Promise.all(room.sockets.map((socket) => socket.next())))
      expect(message).toMatchObject({ type: "rematch", declined: true, accepted: false });
    room.sockets[0].ws.send(JSON.stringify({ type: "rematch" }));
    expect(await room.sockets[0].next()).toMatchObject({ type: "error", code: "rejected" });
    closeAll(room);
  });

  it("neither player sees the other's Deck, Faction or Leader before both take a Seat", async () => {
    const cookies = [await newPlayer(), await newPlayer()];
    const deck = await starterDeck(cookies[0] as string, "swarm");
    const code = await createRoom(cookies[0] as string);
    const a = await TestSocket.open(code, cookies[0] as string);
    await a.nextLobby();
    const b = await TestSocket.open(code, cookies[1] as string);
    await Promise.all([a.nextLobby(), b.nextLobby()]);
    a.takeSeat(deck);
    const [la, lb] = await Promise.all([a.nextLobby(), b.nextLobby()]);
    expect(la.you).toEqual({ seated: true, deckName: "Swarm Starter", lastDeckId: deck });
    expect(lb.opponent).toMatchObject({ present: true, seated: true });
    const text = JSON.stringify(lb);
    expect(text).not.toContain("swarm");
    expect(text).not.toContain("Swarm Starter");
    a.close();
    b.close();
  });

  it("refuses an invalid Deck with a readable message", async () => {
    const cookie = await newPlayer();
    const code = await createRoom(cookie);
    const deck = await savedDeck(cookie, { faction: "swarm", cards: ["swarm-carrion-grub"] });
    const socket = await TestSocket.open(code, cookie);
    await socket.nextLobby();
    socket.takeSeat(deck);
    const error = await socket.next();
    expect(error).toMatchObject({ type: "error", code: "invalid_deck" });
    expect(error.type === "error" && error.message).toContain("Choose a Leader.");
    expect(error.type === "error" && error.message).toContain("at least 22 Unit Cards");
    socket.takeSeat("someone-elses-or-missing");
    expect(await socket.next()).toMatchObject({
      code: "invalid_deck",
      message: "That Deck was not found.",
    });
    socket.close();
  });

  it("refuses a non-Competitive Deck in a Competitive Room, but takes it in a Casual one", async () => {
    const cookie = await newPlayer();
    const starter = await starterDeck(cookie, "court");
    // Add three more Special Cards: still Valid, no longer Competitive.
    const res = await SELF.fetch(`${BASE}/api/decks/${starter}`, { headers: { Cookie: cookie } });
    const { deck } = (await res.json()) as { deck: { cards: string[]; leader: string } };
    const heavy = await savedDeck(cookie, {
      faction: "court",
      leader: deck.leader,
      cards: [...deck.cards, "neutral-mudslide", "neutral-thunderhead", "neutral-black-ice"],
    });
    const competitive = await TestSocket.open(await createRoom(cookie, true), cookie);
    expect(await competitive.nextLobby()).toMatchObject({ competitive: true });
    competitive.takeSeat(heavy);
    const error = await competitive.next();
    expect(error).toMatchObject({ type: "error", code: "invalid_deck" });
    expect(error.type === "error" && error.message).toMatch(
      /Competitive Room.*at most 5 Special Cards/,
    );
    competitive.close();

    const casual = await TestSocket.open(await createRoom(cookie, false), cookie);
    await casual.nextLobby();
    casual.takeSeat(heavy);
    expect(await casual.nextLobby()).toMatchObject({ you: { seated: true } });
    casual.close();
  });

  it("rejects stale actions and resends the current view", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    const j = mover(room.views);
    room.sockets[j].send(START - 1, { type: "pass" });
    expect(await room.sockets[j].next()).toMatchObject({ type: "error", code: "stale_action" });
    const resent = await room.sockets[j].nextView();
    expect(resent.view.actionCount).toBe(START + 1);
    expect(resent.events).toEqual([]);
    closeAll(room);
  });

  it("rejects illegal actions with the engine's message", async () => {
    const room = await seatBoth();
    const waiting = mover(room.views) === 0 ? 1 : 0;
    room.sockets[waiting].send(START, { type: "pass" });
    expect(await room.sockets[waiting].next()).toEqual({
      type: "error",
      code: "rejected",
      message: "It is not your Turn.",
    });
    closeAll(room);
  });

  it("gives a reconnecting account its Seat and just the current view", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    room.sockets[0].close();
    const again = await TestSocket.open(room.code, room.cookies[0]);
    const { view, events } = await again.nextView();
    expect(view.seat).toBe(0);
    expect(view.actionCount).toBe(START + 1);
    expect(events).toEqual([]);
    again.close();
    room.sockets[1].close();
  });

  it("a third account opening the link sees Room full", async () => {
    const room = await seatBoth();
    const third = await TestSocket.open(room.code, await newPlayer());
    expect(await third.next()).toMatchObject({ type: "error", code: "room_full" });
    await new Promise((r) => setTimeout(r, 50));
    expect(third.closed?.code).toBe(CLOSE_ROOM_FULL);
    closeAll(room);
  });

  it("rebuilds its state after eviction and continues the Match", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    await evictDurableObject(env.ROOMS.getByName(room.code));
    await play(room, mover(room.views));
    expect(room.views[0].actionCount).toBe(START + 2);
    closeAll(room);
  });

  it("rebuilds a snapshot of an older state shape from seed plus action log", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    const before = room.views;
    const stub = env.ROOMS.getByName(room.code);
    await runInDurableObject(stub, async (_instance, state) => {
      const snapshot = await state.storage.get<MatchState>("snapshot");
      // An older shape, marked wrong so only a rebuild can show the right round.
      await state.storage.put("snapshot", { ...snapshot, version: 1, round: 99 });
    });
    await evictDurableObject(stub);
    const again = await TestSocket.open(room.code, room.cookies[0]);
    const { view } = await again.nextView();
    expect(view).toEqual(before[0]);
    again.close();
  });

  it("replays seed plus action log when the snapshot is missing, with the pinned catalog", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    await play(room, mover(room.views));
    const before = room.views;
    const stub = env.ROOMS.getByName(room.code);
    const version = await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.delete("snapshot");
      return state.storage.get<string>("catalogVersion");
    });
    expect(version).toBe(CURRENT_CATALOG_VERSION);
    await evictDurableObject(stub);
    const again = await TestSocket.open(room.code, room.cookies[0]);
    const { view } = await again.nextView();
    expect(view).toEqual(before[0]);
    again.close();
    closeAll(room);
  });

  it("never sends a Seat the opponent's hidden cards", async () => {
    const room = await seatBoth();
    const [va, vb] = room.views;
    const messageA = JSON.stringify(va);
    const messageB = JSON.stringify(vb);
    for (const c of vb.you.hand) expect(messageA).not.toContain(`"uid":${c.uid},`);
    for (const c of va.you.hand) expect(messageB).not.toContain(`"uid":${c.uid},`);
    closeAll(room);
  });
});

describe("Room disconnect lifecycle", () => {
  async function disconnected(room: Seated, seat: 0 | 1) {
    room.sockets[seat].close();
    await expect
      .poll(async () =>
        runInDurableObject(env.ROOMS.getByName(room.code), async (_room, ctx) => {
          const times = await ctx.storage.get<[number | null, number | null]>("disconnectedAt");
          return times?.[seat] ?? null;
        }),
      )
      .not.toBeNull();
  }

  async function stored(room: Seated) {
    return env.DB.prepare("SELECT * FROM match_results WHERE room_code = ?").bind(room.code).all();
  }

  it("reconnect within grace cancels a claim, including after eviction", async () => {
    const room = await seatBoth();
    await disconnected(room, 1);
    room.sockets[0].ws.send(JSON.stringify({ type: "claimWin" }));
    expect(await room.sockets[0].next()).toMatchObject({ code: "rejected" });
    await evictDurableObject(env.ROOMS.getByName(room.code));
    const again = await TestSocket.open(room.code, room.cookies[1]);
    expect((await again.nextView()).view.phase).toBe("turns");
    room.sockets[0].ws.send(JSON.stringify({ type: "claimWin" }));
    expect(await room.sockets[0].next()).toMatchObject({ code: "rejected" });
    expect(
      (
        await env.DB.prepare("SELECT id FROM match_results WHERE room_code = ?")
          .bind(room.code)
          .all()
      ).results,
    ).toHaveLength(0);
    again.close();
    closeAll(room);
  });

  it("alarm after grace makes a win claimable but never automatically awards it", async () => {
    const room = await seatBoth();
    await disconnected(room, 1);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + DISCONNECT_GRACE_MS + 1);
    try {
      await runInDurableObject(env.ROOMS.getByName(room.code), async (instance) =>
        instance.alarm(),
      );
      expect(
        (
          await env.DB.prepare("SELECT id FROM match_results WHERE room_code = ?")
            .bind(room.code)
            .all()
        ).results,
      ).toHaveLength(0);
      room.sockets[0].ws.send(JSON.stringify({ type: "claimWin" }));
      const { view } = await room.sockets[0].nextView();
      expect(view.result).toEqual({ outcome: "win", winner: 0, reason: "disconnect" });
      expect((await stored(room)).results).toHaveLength(1);
      await evictDurableObject(env.ROOMS.getByName(room.code));
      const again = await TestSocket.open(room.code, room.cookies[1]);
      expect((await again.nextView()).view.result).toEqual(view.result);
      again.close();
    } finally {
      clock.mockRestore();
      closeAll(room);
    }
  });

  it("starts a Rematch after a Disconnect Win without restoring the previous result on eviction", async () => {
    const room = await seatBoth();
    await disconnected(room, 1);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + DISCONNECT_GRACE_MS + 1);
    try {
      room.sockets[0].ws.send(JSON.stringify({ type: "claimWin" }));
      expect((await room.sockets[0].nextView()).view.result).toMatchObject({
        reason: "disconnect",
      });
      room.sockets[1] = await TestSocket.open(room.code, room.cookies[1]);
      await room.sockets[1].nextView();
      expect(await room.sockets[1].next()).toMatchObject({ type: "rematch", declined: false });
      room.sockets[0].ws.send(JSON.stringify({ type: "rematch" }));
      await Promise.all(room.sockets.map((socket) => socket.next()));
      room.sockets[1].ws.send(JSON.stringify({ type: "rematch" }));
      const lobbies = await Promise.all(room.sockets.map((socket) => socket.nextLobby()));
      room.sockets[0].takeSeat(lobbies[0]?.you.lastDeckId as string);
      await Promise.all(room.sockets.map((socket) => socket.nextLobby()));
      room.sockets[1].takeSeat(lobbies[1]?.you.lastDeckId as string);
      const views = await Promise.all(room.sockets.map((socket) => socket.nextView()));
      expect(views[0]?.view.phase).toBe("redraw");
      await evictDurableObject(env.ROOMS.getByName(room.code));
      room.sockets[0] = await TestSocket.open(room.code, room.cookies[0]);
      const restored = (await room.sockets[0].nextView()).view;
      expect(restored.phase).toBe("redraw");
      expect(restored.result).toBeNull();
      expect((await stored(room)).results).toHaveLength(1);
    } finally {
      clock.mockRestore();
      closeAll(room);
    }
  });

  it.each([1, 2])(
    "24-hour expiry with %s absent players awards a Disconnect Win or voids and deletes storage",
    async (absent) => {
      const room = await seatBoth();
      await disconnected(room, 1);
      if (absent === 2) await disconnected(room, 0);
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + ROOM_IDLE_MS + 1);
      try {
        const size = await runInDurableObject(
          env.ROOMS.getByName(room.code),
          async (instance, ctx) => {
            await instance.alarm();
            return (await ctx.storage.list()).size;
          },
        );
        expect(size).toBe(0);
        const rows = (await stored(room)).results;
        expect(rows).toHaveLength(absent === 1 ? 1 : 0);
        if (absent === 1) expect(rows[0]).toMatchObject({ ended_by: "disconnect", winner_seat: 0 });
      } finally {
        clock.mockRestore();
        closeAll(room);
      }
    },
  );
});

it("shows duplicate Unicode display names and refreshes a name on reconnect", async () => {
  const first = await newPlayer("雪 Geralt");
  const second = await newPlayer("雪 Geralt");
  const code = await createRoom(first);
  const a = await TestSocket.open(code, first);
  await a.nextLobby();
  const b = await TestSocket.open(code, second);
  const initial = await b.nextLobby();
  expect(initial.opponent.displayName).toBe("雪 Geralt");
  await a.nextLobby();
  const response = await SELF.fetch(`${BASE}/api/me/profile`, {
    method: "PATCH",
    headers: { Cookie: first, Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Émile" }),
  });
  expect(response.status).toBe(200);
  a.close();
  const again = await TestSocket.open(code, first);
  await again.nextLobby();
  expect((await b.nextLobby()).opponent.displayName).toBe("Émile");
  again.close();
  b.close();
});

it("ends pre-Clerk Rooms without writing their Matches into fresh account data", async () => {
  const room = await seatBoth();
  const stub = env.ROOMS.getByName(room.code);
  await runInDurableObject(stub, async (_instance, ctx) => {
    await ctx.storage.put("meta", { code: room.code, competitive: false });
  });
  await evictDurableObject(stub);
  const alarm = await runInDurableObject(stub, async (instance, ctx) => {
    await instance.alarm();
    return ctx.storage.getAlarm();
  });
  expect(alarm).toBeNull();
  expect((await room.sockets[0].next()).type).toBe("error");
  expect(
    (await env.DB.prepare("SELECT id FROM match_results WHERE room_code = ?").bind(room.code).all())
      .results,
  ).toHaveLength(0);
  closeAll(room);
});

describe("Turn Timer", () => {
  async function post(body: unknown) {
    return SELF.fetch(`${BASE}/api/rooms`, {
      method: "POST",
      headers: { Cookie: await newPlayer(), Origin: BASE, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** Runs the Room's alarm as if `ms` had passed. */
  async function alarmAfter(room: Seated, ms: number): Promise<void> {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + ms);
    try {
      await runInDurableObject(env.ROOMS.getByName(room.code), (instance) => instance.alarm());
    } finally {
      clock.mockRestore();
    }
  }

  it("a created Room's Turn Timer lasts 30 to 600 whole seconds, or is off", async () => {
    for (const turnTimer of [29, 601, 90.5, "120", true])
      expect((await post({ turnTimer })).status).toBe(400);
    for (const turnTimer of [30, 600, null]) {
      const res = await post({ turnTimer });
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ turnTimer });
    }
  });

  it("shows in the lobby, and both Seats see both countdowns", async () => {
    const cookie = await newPlayer();
    const code = await createRoom(cookie, false, 45);
    const socket = await TestSocket.open(code, cookie);
    expect(await socket.nextLobby()).toMatchObject({ turnTimer: 45, matched: false });
    socket.close();

    const room = await seatBoth(false, { turnTimer: 45, redraw: false });
    const [a, b] = room.timers ?? [];
    // Redraw: each Seat has its own countdown, since both act at once.
    expect(a?.you).toBeTypeOf("number");
    expect(a?.opponent).toBe(b?.you);
    expect((a?.you ?? 0) - (a?.serverNow ?? 0)).toBeLessThanOrEqual(45_000);
    await play(room, 0, { type: "confirmRedraw" });
    expect(room.timers?.[0]?.you).toBeNull();
    expect(room.timers?.[1]?.you).toBe(b?.you);
    await play(room, 1, { type: "confirmRedraw" });
    const i = mover(room.views);
    expect(room.timers?.[i]?.you).toBeTypeOf("number");
    expect(room.timers?.[i === 0 ? 1 : 0]?.you).toBeNull();
    closeAll(room);
  });

  it("on expiry keeps the hand in Redraw, then Passes on a Turn, logged as timed out", async () => {
    const room = await seatBoth(false, { turnTimer: 30, redraw: false });
    await alarmAfter(room, 30_001);
    // Each Seat's Redraw was confirmed for it, one view per expiry.
    await nextViews(room);
    await nextViews(room);
    expect(room.views[0].phase).toBe("turns");
    const i = mover(room.views);
    await alarmAfter(room, 2 * 30_001);
    await nextViews(room);
    expect(room.events?.[i === 0 ? 1 : 0]).toContainEqual({
      type: "passed",
      seat: i,
      reason: "turnTimer",
    });
    expect(room.views[i].you.passed).toBe(true);
    const log = await runInDurableObject(env.ROOMS.getByName(room.code), (_instance, ctx) =>
      ctx.storage.get<LoggedAction[]>("log"),
    );
    expect(log?.map((entry) => entry.timedOut)).toEqual([true, true, true]);
    expect(log?.at(-1)).toMatchObject({ seat: i, action: { type: "pass" } });
    closeAll(room);
  });

  it("restarts after each action by the player who must act", async () => {
    const room = await seatBoth(false, { turnTimer: 60 });
    const i = mover(room.views);
    const before = room.timers?.[i]?.you ?? 0;
    await new Promise((r) => setTimeout(r, 5));
    await play(room, i);
    const j = mover(room.views);
    if (j === i) expect(room.timers?.[i]?.you).toBeGreaterThan(before);
    else expect(room.timers?.[j]?.you).toBeGreaterThan(before);
    closeAll(room);
  });

  it("Rooms created without it never act for a player", async () => {
    const room = await seatBoth();
    expect(room.timers).toEqual([undefined, undefined]);
    const i = mover(room.views);
    await alarmAfter(room, 10 * 60 * 1000);
    room.sockets[i].send(room.views[i].actionCount, { type: "pass" });
    await nextViews(room);
    expect(room.events?.[i]).toContainEqual({ type: "passed", seat: i, reason: "player" });
    closeAll(room);
  });
});
