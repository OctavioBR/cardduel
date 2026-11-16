import { env, evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { CLOSE_ROOM_FULL, type SeatView } from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET } from "../src/room-code";
import { createRoom, firstPlay, TestSocket } from "./ws-client";

interface Seated {
  code: string;
  sockets: [TestSocket, TestSocket];
  views: [SeatView, SeatView];
}

async function seatBoth(): Promise<Seated> {
  const code = await createRoom();
  const a = await TestSocket.open(code, "token-a");
  expect(await a.next()).toEqual({ type: "waiting", seat: 0, code });
  const b = await TestSocket.open(code, "token-b");
  const [ma, mb] = await Promise.all([a.nextView(), b.nextView()]);
  const room: Seated = { code, sockets: [a, b], views: [ma.view, mb.view] };
  expect(room.views[0].phase).toBe("redraw");
  // Both keep their opening hands; the first Turn then starts.
  await play(room, 0, { type: "confirmRedraw" });
  await play(room, 1, { type: "confirmRedraw" });
  expect(room.views[0].phase).toBe("turns");
  return room;
}

/** Action count once both Seats have confirmed Redraw. */
const START = 2;

/** Index of the Seat whose Turn it is. */
function mover(views: [SeatView, SeatView]): 0 | 1 {
  return views[0].turn === "you" ? 0 : 1;
}

/** Sends an action from Seat `i` and returns both Seats' next views. */
async function play(room: Seated, i: 0 | 1, action = firstPlay(room.views[i])): Promise<void> {
  room.sockets[i].send(room.views[i].actionCount, action);
  const [ma, mb] = await Promise.all([room.sockets[0].nextView(), room.sockets[1].nextView()]);
  room.views = [ma.view, mb.view];
}

function closeAll(room: Seated): void {
  for (const s of room.sockets) s.close();
}

describe("POST /api/rooms", () => {
  it("returns a 6-character code from the unambiguous alphabet", async () => {
    const code = await createRoom();
    expect(code).toHaveLength(6);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });

  it("refuses WebSockets to a Room that was never created", async () => {
    const res = await SELF.fetch("https://card-duel.test/api/rooms/ZZZZZZ/ws?token=x", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(404);
  });
});

describe("Room", () => {
  it("starts the Match when both Seats are taken and plays to Match end", async () => {
    const room = await seatBoth();
    expect(room.views[0].seat).toBe(0);
    expect(room.views[1].seat).toBe(1);
    expect(room.views[0].you.hand).toHaveLength(10);
    expect(room.views[0].opponent.handSize).toBe(10);

    for (let guard = 0; room.views[0].phase !== "ended" && guard < 200; guard++) {
      const i = mover(room.views);
      // Play a few cards per Round, then Pass, so the Match ends quickly.
      const view = room.views[i];
      const action =
        view.you.hand.length > 10 - 2 * view.round ? firstPlay(view) : { type: "pass" as const };
      await play(room, i, action);
      expect(room.views[0].actionCount).toBe(room.views[1].actionCount);
    }
    expect(room.views[0].phase).toBe("ended");
    expect(room.views[0].result).not.toBeNull();
    expect(room.views[1].result).toEqual(room.views[0].result);
    closeAll(room);
  });

  it("rejects stale actions and resends the current view", async () => {
    const room = await seatBoth();
    const i = mover(room.views);
    await play(room, i);
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

  it("gives a reconnecting Seat just its current view", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    room.sockets[0].close();
    const again = await TestSocket.open(room.code, "token-a");
    const { view, events } = await again.nextView();
    expect(view.seat).toBe(0);
    expect(view.actionCount).toBe(START + 1);
    expect(events).toEqual([]);
    again.close();
    room.sockets[1].close();
  });

  it("refuses a third connection with Room full", async () => {
    const room = await seatBoth();
    const third = await TestSocket.open(room.code, "token-c");
    expect(await third.next()).toMatchObject({ type: "error", code: "room_full" });
    await new Promise((r) => setTimeout(r, 50));
    expect(third.closed?.code).toBe(CLOSE_ROOM_FULL);
    closeAll(room);
  });

  it("rebuilds its state after eviction and continues the Match", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    const before = room.views;

    await evictDurableObject(env.ROOMS.getByName(room.code));

    // Hibernated sockets stay open; the next message wakes a fresh instance that reloads.
    await play(room, mover(room.views));
    expect(room.views[0].actionCount).toBe(START + 2);
    expect(room.views[0].board.you.score + room.views[0].board.opponent.score).toBeGreaterThan(
      before[0].board.you.score + before[0].board.opponent.score,
    );
    closeAll(room);
  });

  it("replays seed plus action log when the snapshot is missing", async () => {
    const room = await seatBoth();
    await play(room, mover(room.views));
    await play(room, mover(room.views));
    const before = room.views;
    const stub = env.ROOMS.getByName(room.code);
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.delete("snapshot");
    });
    await evictDurableObject(stub);

    const again = await TestSocket.open(room.code, "token-a");
    const { view } = await again.nextView();
    expect(view).toEqual(before[0]);
    again.close();
    closeAll(room);
  });

  it("never sends a Seat the opponent's hidden cards", async () => {
    const room = await seatBoth();
    const [va, vb] = room.views;
    const handA = va.you.hand.map((c) => c.uid);
    const handB = vb.you.hand.map((c) => c.uid);
    const messageA = JSON.stringify(va);
    const messageB = JSON.stringify(vb);
    for (const uid of handB) expect(messageA).not.toContain(`"uid":${uid},`);
    for (const uid of handA) expect(messageB).not.toContain(`"uid":${uid},`);
    expect(va.opponent).not.toHaveProperty("hand");
    closeAll(room);
  });
});
