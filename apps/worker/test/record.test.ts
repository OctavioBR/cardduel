import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("Record endpoint requires authentication and returns only the current player's counters", async () => {
  expect((await SELF.fetch("https://card-duel.test/api/record")).status).toBe(401);
  const signup = await SELF.fetch("https://card-duel.test/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "record_reader", password: "test password" }),
  });
  const { account } = (await signup.json()) as { account: { id: string } };
  await env.DB.prepare(
    "UPDATE records SET wins = 4, losses = 3, draws = 2, disconnect_wins = 1, disconnect_losses = 1 WHERE account_id = ?",
  )
    .bind(account.id)
    .run();
  const result = await SELF.fetch("https://card-duel.test/api/record", {
    headers: { Cookie: (signup.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "" },
  });
  expect(await result.json()).toEqual({
    record: { wins: 4, losses: 3, draws: 2, disconnectWins: 1, disconnectLosses: 1 },
  });
});
