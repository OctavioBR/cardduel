import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { me as readProfile } from "../src/auth/routes";
import { BASE, newIdentity, sessionToken } from "./identity";

function me(cookie = "") {
  return SELF.fetch(`${BASE}/api/me`, { headers: { Cookie: cookie } });
}
function update(cookie: string, displayName: unknown, origin = BASE, extra = {}) {
  return SELF.fetch(`${BASE}/api/me/profile`, {
    method: "PATCH",
    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, ...extra }),
  });
}

describe("Clerk authentication", () => {
  it("reports missing or invalid configuration without exposing configured values", async () => {
    for (const [key, reason] of [
      ["", "configuration-missing"],
      ["sk_test_wrong_key_type", "publishable-key-invalid"],
      ["pk_test_invalid%", "publishable-key-invalid"],
    ]) {
      const bindings = { ...env, CLERK_PUBLISHABLE_KEY: key ?? "" };
      const response = await readProfile(new Request("http://localhost:8787/api/me"), bindings);
      expect(response.status).toBe(503);
      expect(response.headers.get("X-Card-Duel-Auth")).toBe(reason);
      expect(await response.json()).toEqual({
        error: "auth_unavailable",
        message: "Sign in is unavailable. Please try again later.",
      });
      const production = await readProfile(new Request(`${BASE}/api/me`), bindings);
      expect(production.headers.has("X-Card-Duel-Auth")).toBe(false);
    }
  });

  it("creates one game profile, Record and Starter Deck per Faction under concurrent retries", async () => {
    const cookie = `__clerk_db_jwt=fixture; __client_uat=1; __session=${await sessionToken("user_race", BASE)}`;
    const responses = await Promise.all([me(cookie), me(cookie), me(cookie)]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[0]).toMatchObject({ account: { displayName: null } });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM accounts WHERE clerk_user_id = 'user_race'",
      ).first(),
    ).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM records").first()).toEqual({ n: 1 });
    expect(
      (
        await env.DB.prepare(
          "SELECT faction, COUNT(*) AS n FROM decks GROUP BY faction ORDER BY faction",
        ).all()
      ).results,
    ).toEqual([
      { faction: "court", n: 1 },
      { faction: "swarm", n: 1 },
    ]);
  });
  it("rejects missing, forged, expired, wrong-issuer and wrong-origin tokens", async () => {
    const valid = await sessionToken("user_rejected", BASE);
    const corrupt = `${valid.slice(0, -8)}AAAAAAAA`;
    for (const token of [
      "",
      "forged",
      corrupt,
      await sessionToken("user_expired", BASE, { exp: 1 }),
      await sessionToken("user_issuer", BASE, { iss: "https://attacker.invalid" }),
      await sessionToken("user_origin", "https://attacker.invalid"),
      await sessionToken("user_pending", BASE, { sts: "pending" }),
    ]) {
      expect(
        await (await me(`__clerk_db_jwt=fixture; __client_uat=1; __session=${token}`)).json(),
      ).toEqual({ account: null });
      expect(
        await (
          await SELF.fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
        ).json(),
      ).toEqual({ account: null });
    }
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM accounts WHERE clerk_user_id != 'user_race'",
      ).first(),
    ).toEqual({ n: 0 });
  });
  it("accepts the same verified identity through an Authorization header", async () => {
    const token = await sessionToken("user_header", BASE);
    expect(
      await (
        await SELF.fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      ).json(),
    ).toMatchObject({ account: { displayName: null } });
  });
  it("does not accept old cookies or expose handwritten password endpoints", async () => {
    expect(await (await me("cd_session=legacy-token")).json()).toEqual({ account: null });
    for (const path of ["signup", "signin", "signout"])
      expect(
        (
          await SELF.fetch(`${BASE}/api/auth/${path}`, {
            method: "POST",
            headers: { Origin: BASE },
          })
        ).status,
      ).toBe(404);
  });
});

describe("display names", () => {
  it("allows duplicate names and changes only the authenticated profile", async () => {
    const a = await newIdentity("Geralt");
    const b = await newIdentity("Geralt");
    const first = (await (await me(a)).json()) as { account: { id: string } };
    const second = (await (await me(b)).json()) as { account: { id: string } };
    expect(first.account.id).not.toBe(second.account.id);
    const response = await update(a, "  Émile $&  ", BASE, { id: second.account.id });
    expect(await response.json()).toEqual({
      account: { id: first.account.id, displayName: "Émile $&" },
    });
    expect(await (await me(b)).json()).toMatchObject({ account: { displayName: "Geralt" } });
  });
  it("validates Unicode code points, blank names, control characters and line breaks", async () => {
    const cookie = await newIdentity();
    for (const name of [null, 3, "", "   ", "a".repeat(31), "a\nb", "a\tb", "a\u2028b", "a\u200bb"])
      expect((await update(cookie, name)).status).toBe(400);
    expect((await update(cookie, "😀".repeat(30))).status).toBe(200);
    expect((await update(cookie, "<script>alert(1)</script>")).status).toBe(200);
  });
  it("requires authentication and a trusted Origin for profile edits and Room creation", async () => {
    expect((await update("", "Geralt")).status).toBe(401);
    const cookie = await newIdentity();
    expect((await update(cookie, "Geralt", "https://attacker.invalid")).status).toBe(403);
    expect((await update(cookie, "Geralt", "")).status).toBe(403);
    expect(
      (
        await SELF.fetch(`${BASE}/api/rooms`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: "https://attacker.invalid" },
        })
      ).status,
    ).toBe(403);
  });
  it("requires a completed profile before Deck access or Room creation", async () => {
    const cookie = `__clerk_db_jwt=fixture; __client_uat=1; __session=${await sessionToken("user_onboarding", BASE)}`;
    expect((await SELF.fetch(`${BASE}/api/decks`, { headers: { Cookie: cookie } })).status).toBe(
      403,
    );
    expect(
      (
        await SELF.fetch(`${BASE}/api/rooms`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: BASE },
        })
      ).status,
    ).toBe(403);
  });
});
