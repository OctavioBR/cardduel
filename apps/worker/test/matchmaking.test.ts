import { env, runInDurableObject, SELF } from "cloudflare:test";
import { CLOSE_NO_MATCH, CLOSE_QUEUE_REFUSED, DEFAULT_TURN_TIMER_SECONDS } from "@card-duel/engine";
import { describe, expect, it, vi } from "vitest";
import { MATCHED_ROOM_CONNECT_MS } from "../src/room";
import { BASE, newPlayer, savedDeck, starterDeck, TestSocket } from "./ws-client";

async function matchedPair(queue: "casual" | "competitive" = "casual") {
  const cookies = [await newPlayer(), await newPlayer()] as const;
  const decks = [await starterDeck(cookies[0], "swarm"), await starterDeck(cookies[1], "court")];
  const first = await TestSocket.queue(cookies[0], queue, decks[0] as string);
  expect(await first.nextQueue()).toMatchObject({ type: "searching", queue });
  const second = await TestSocket.queue(cookies[1], queue, decks[1] as string);
  expect(await second.nextQueue()).toMatchObject({ type: "searching", queue });
  const [ma, mb] = await Promise.all([first.nextQueue(), second.nextQueue()]);
  if (ma.type !== "matched" || mb.type !== "matched") expect.fail("Expected both to be matched");
  expect(ma.code).toBe(mb.code);
  return { code: ma.code, cookies, decks, sockets: [first, second] };
}

/** A Deck that is Valid but not a Competitive Deck: three Special Cards too many. */
async function heavyDeck(cookie: string): Promise<string> {
  const starter = await starterDeck(cookie, "court");
  const res = await SELF.fetch(`${BASE}/api/decks/${starter}`, { headers: { Cookie: cookie } });
  const { deck } = (await res.json()) as { deck: { cards: string[]; leader: string } };
  return savedDeck(cookie, {
    faction: "court",
    leader: deck.leader,
    cards: [...deck.cards, "neutral-mudslide", "neutral-thunderhead", "neutral-black-ice"],
  });
}

describe("Matchmaking", () => {
  it("pairs two players into a Matched Room that starts once both connect", async () => {
    const { code, cookies, sockets } = await matchedPair();
    await expect.poll(() => sockets[0]?.closed?.code).toBe(1000);
    const a = await TestSocket.open(code, cookies[0]);
    const lobby = await a.nextLobby();
    expect(lobby).toMatchObject({
      matched: true,
      competitive: false,
      turnTimer: DEFAULT_TURN_TIMER_SECONDS,
      you: { seated: true, deckName: "Swarm Starter" },
      opponent: { seated: true },
    });
    const b = await TestSocket.open(code, cookies[1]);
    const [va, vb] = await Promise.all([a.nextView(), b.nextView()]);
    expect(va.view.phase).toBe("redraw");
    expect(vb.view.you.faction).toBe("court");
    expect(va.turnTimer?.you).toBeTypeOf("number");
    a.close();
    b.close();
  });

  it("remembers the Deck committed to the Queue as the last used Deck", async () => {
    const { cookies, decks } = await matchedPair();
    const res = await SELF.fetch(`${BASE}/api/decks`, { headers: { Cookie: cookies[0] } });
    expect(await res.json()).toMatchObject({ lastDeckId: decks[0] });
  });

  it("the Competitive Queue refuses a Deck that is not a Competitive Deck", async () => {
    const cookie = await newPlayer();
    const deck = await heavyDeck(cookie);
    const refused = await TestSocket.queue(cookie, "competitive", deck);
    const error = await refused.nextQueue();
    expect(error).toMatchObject({ type: "error", code: "invalid_deck" });
    expect(error.type === "error" && error.message).toMatch(/Competitive Queue.*at most 5 Special/);
    await expect.poll(() => refused.closed?.code).toBe(CLOSE_QUEUE_REFUSED);
    const casual = await TestSocket.queue(cookie, "casual", deck);
    expect(await casual.nextQueue()).toMatchObject({ type: "searching", queue: "casual" });
    casual.close();
  });

  it("never pairs an account with itself: a second search replaces the first", async () => {
    const cookie = await newPlayer();
    const deck = await starterDeck(cookie, "swarm");
    const first = await TestSocket.queue(cookie, "casual", deck);
    await first.nextQueue();
    const second = await TestSocket.queue(cookie, "casual", deck);
    expect(await first.nextQueue()).toMatchObject({ type: "error", code: "replaced" });
    expect(await second.nextQueue()).toMatchObject({ type: "searching" });
    await expect.poll(() => first.closed?.code).toBe(CLOSE_QUEUE_REFUSED);
    second.close();
  });

  it("closes the Matched Room with no Match when a player does not connect in time", async () => {
    const { code, cookies } = await matchedPair();
    const a = await TestSocket.open(code, cookies[0]);
    await a.nextLobby();
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + MATCHED_ROOM_CONNECT_MS + 1);
    try {
      const size = await runInDurableObject(env.ROOMS.getByName(code), async (instance, ctx) => {
        await instance.alarm();
        return (await ctx.storage.list()).size;
      });
      expect(size).toBe(0);
    } finally {
      clock.mockRestore();
    }
    expect(await a.next()).toMatchObject({ type: "error", code: "no_match" });
    await expect.poll(() => a.closed?.code).toBe(CLOSE_NO_MATCH);
    const rows = await env.DB.prepare("SELECT id FROM match_results WHERE room_code = ?")
      .bind(code)
      .all();
    expect(rows.results).toHaveLength(0);
  });

  it("refuses to queue without a Deck or with an unknown Queue", async () => {
    const cookie = await newPlayer();
    const deck = await starterDeck(cookie, "swarm");
    const unknown = await TestSocket.queue(cookie, "ranked" as "casual", deck);
    expect(await unknown.nextQueue()).toMatchObject({ type: "error", code: "bad_request" });
    const missing = await TestSocket.queue(cookie, "casual", "not-my-deck");
    expect(await missing.nextQueue()).toMatchObject({ type: "error", code: "invalid_deck" });
  });
});
