import { env, SELF } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { ACTIVITY_THROTTLE_MS, ACTIVITY_WINDOW_MS } from "../src/activity";
import { BASE, createRoom, newPlayer, starterDeck, TestSocket } from "./ws-client";

async function accountId(cookie: string): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/me`, { headers: { Cookie: cookie } });
  return ((await res.json()) as { account: { id: string } }).account.id;
}

function lastSeen(id: string): Promise<number | null> {
  return env.DB.prepare("SELECT last_seen AS lastSeen FROM accounts WHERE id = ?")
    .bind(id)
    .first<{ lastSeen: number | null }>()
    .then((row) => row?.lastSeen ?? null);
}

function setLastSeen(id: string, value: number | null) {
  return env.DB.prepare("UPDATE accounts SET last_seen = ? WHERE id = ?").bind(value, id).run();
}

async function recentlyActive(cookie: string): Promise<number> {
  const res = await SELF.fetch(`${BASE}/api/record`, { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { recentlyActive: number }).recentlyActive;
}

it("signed-in requests mark the player active, at most once a minute", async () => {
  const cookie = await newPlayer();
  const id = await accountId(cookie);
  await vi.waitFor(async () => expect(await lastSeen(id)).not.toBeNull());

  const fresh = Date.now() - ACTIVITY_THROTTLE_MS / 2;
  await setLastSeen(id, fresh);
  await accountId(cookie);
  expect(await lastSeen(id)).toBe(fresh);

  const stale = Date.now() - ACTIVITY_THROTTLE_MS - 1000;
  await setLastSeen(id, stale);
  await accountId(cookie);
  await vi.waitFor(async () => expect(await lastSeen(id)).toBeGreaterThan(stale));
});

it("counts players active within the window, the viewer included", async () => {
  const viewer = await newPlayer();
  const viewerId = await accountId(viewer);
  const otherId = await accountId(await newPlayer());
  await vi.waitFor(async () => expect(await lastSeen(otherId)).not.toBeNull());

  // The viewer counts even while their own activity is not yet written.
  await setLastSeen(viewerId, null);
  await setLastSeen(otherId, Date.now() - ACTIVITY_WINDOW_MS - 1000);
  const without = await recentlyActive(viewer);
  expect(without).toBeGreaterThanOrEqual(1);

  await setLastSeen(otherId, Date.now());
  expect(await recentlyActive(viewer)).toBe(without + 1);
});

it("a message in a Room marks both connected Seat holders active", async () => {
  const cookies = [await newPlayer(), await newPlayer()] as const;
  const ids = [await accountId(cookies[0]), await accountId(cookies[1])];
  const deck = await starterDeck(cookies[0], "swarm");
  const code = await createRoom(cookies[0]);
  const a = await TestSocket.open(code, cookies[0]);
  await a.nextLobby();
  const b = await TestSocket.open(code, cookies[1]);
  await Promise.all([a.nextLobby(), b.nextLobby()]);
  for (const id of ids) await vi.waitFor(async () => expect(await lastSeen(id)).not.toBeNull());

  const old = Date.now() - ACTIVITY_WINDOW_MS;
  for (const id of ids) await setLastSeen(id, old);
  a.takeSeat(deck);
  await Promise.all([a.nextLobby(), b.nextLobby()]);
  for (const id of ids)
    await vi.waitFor(async () => expect(await lastSeen(id)).toBeGreaterThan(old));
});
