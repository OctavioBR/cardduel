import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { BASE, newIdentity } from "./identity";

it("Record endpoint requires authentication and returns only the current player's counters", async () => {
  expect((await SELF.fetch(`${BASE}/api/record`)).status).toBe(401);
  const cookie = await newIdentity("Record reader");
  const { account } = (await (
    await SELF.fetch(`${BASE}/api/me`, { headers: { Cookie: cookie } })
  ).json()) as { account: { id: string } };
  await env.DB.prepare(
    "UPDATE records SET wins = 4, losses = 3, draws = 2, disconnect_wins = 1, disconnect_losses = 1 WHERE account_id = ?",
  )
    .bind(account.id)
    .run();
  const result = await SELF.fetch(`${BASE}/api/record`, { headers: { Cookie: cookie } });
  expect(await result.json()).toEqual({
    record: { wins: 4, losses: 3, draws: 2, disconnectWins: 1, disconnectLosses: 1 },
  });
});
