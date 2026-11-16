import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS } from "../src/auth/password";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../src/auth/session";

const BASE = "https://card-duel.test";

function post(path: string, body: unknown, cookie?: string) {
  return SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function cookieFrom(res: Response): string {
  const header = res.headers.get("Set-Cookie") ?? "";
  const value = header.split(";")[0] ?? "";
  if (!value.startsWith(`${SESSION_COOKIE}=`)) throw new Error(`No session cookie in ${header}`);
  return value;
}

async function signUp(username: string, password = "correct horse") {
  const res = await post("/api/auth/signup", { username, password });
  return { res, cookie: res.status === 201 ? cookieFrom(res) : "" };
}

function meWith(cookie: string) {
  return SELF.fetch(`${BASE}/api/me`, { headers: { Cookie: cookie } });
}

describe("sign up", () => {
  it("creates an account, a Record and a session cookie", async () => {
    const { res, cookie } = await signUp("Ada_Lovelace");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ account: { username: "Ada_Lovelace" } });
    const header = res.headers.get("Set-Cookie") ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
    expect(await (await meWith(cookie)).json()).toMatchObject({
      account: { username: "Ada_Lovelace" },
    });
    const record = await env.DB.prepare(
      "SELECT wins FROM records r JOIN accounts a ON a.id = r.account_id WHERE a.username = ?",
    )
      .bind("Ada_Lovelace")
      .first();
    expect(record).toEqual({ wins: 0 });
  });

  it("rejects duplicate usernames ignoring case", async () => {
    await signUp("Grace");
    const { res } = await signUp("gRACE");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "username_taken" });
  });

  it("validates usernames and passwords", async () => {
    for (const username of ["ab", "a".repeat(21), "with space", "dash-name", "émile"]) {
      expect((await signUp(username)).res.status, username).toBe(400);
    }
    expect((await signUp("ok_name", "short")).res.status).toBe(400);
    expect((await signUp("ok_name", "exactly8")).res.status).toBe(201);
  });

  it("stores the hash with its parameters, never the password", async () => {
    await signUp("Hopper", "s3cret password");
    const row = await env.DB.prepare(
      "SELECT password_hash, password_salt, password_iterations, password_algorithm FROM accounts WHERE username_key = 'hopper'",
    ).first<{
      password_hash: string;
      password_salt: string;
      password_iterations: number;
      password_algorithm: string;
    }>();
    expect(row?.password_iterations).toBe(PBKDF2_ITERATIONS);
    expect(row?.password_algorithm).toBe("PBKDF2-SHA256");
    expect(atob(row?.password_salt ?? "")).toHaveLength(16);
    expect(atob(row?.password_hash ?? "")).toHaveLength(32);
    expect(JSON.stringify(row)).not.toContain("s3cret");
  });

  it("requires JSON", async () => {
    const res = await SELF.fetch(`${BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=a&password=b",
    });
    expect(res.status).toBe(415);
  });
});

describe("sign in and sign out", () => {
  it("signs in with the right password, case-insensitively by username", async () => {
    await signUp("Turing", "enigma machine");
    const res = await post("/api/auth/signin", { username: "turing", password: "enigma machine" });
    expect(res.status).toBe(200);
    expect(await (await meWith(cookieFrom(res))).json()).toMatchObject({
      account: { username: "Turing" },
    });
  });

  it("rejects a wrong password and an unknown username the same way", async () => {
    await signUp("Lamarr", "frequency hop");
    const wrong = await post("/api/auth/signin", { username: "Lamarr", password: "nope nope" });
    const unknown = await post("/api/auth/signin", {
      username: "Nobody",
      password: "frequency hop",
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("signs out: the session is deleted and the cookie cleared", async () => {
    const { cookie } = await signUp("Noether");
    const res = await post("/api/auth/signout", {}, cookie);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await (await meWith(cookie)).json()).toEqual({ account: null });
  });

  it("/api/me without a valid session answers with no account", async () => {
    const res = await SELF.fetch(`${BASE}/api/me`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ account: null });
    expect(await (await meWith(`${SESSION_COOKIE}=forged`)).json()).toEqual({ account: null });
  });
});

describe("throttling", () => {
  it("blocks a username after 5 failed sign-ins, even with the right password, and resets on success", async () => {
    await signUp("Babbage", "difference engine");
    for (let i = 0; i < 5; i++) {
      expect(
        (await post("/api/auth/signin", { username: "Babbage", password: "wrong password" }))
          .status,
      ).toBe(401);
    }
    const blocked = await post("/api/auth/signin", {
      username: "babbage",
      password: "difference engine",
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);

    // Once the window has passed, the right password works and clears the count.
    await env.DB.prepare(
      "UPDATE sign_in_failures SET window_start = 0 WHERE username_key = 'babbage'",
    ).run();
    expect(
      (await post("/api/auth/signin", { username: "Babbage", password: "difference engine" }))
        .status,
    ).toBe(200);
    expect(
      await env.DB.prepare("SELECT * FROM sign_in_failures WHERE username_key = 'babbage'").first(),
    ).toBeNull();
  });

  it("throttles per username, not globally", async () => {
    await signUp("Curie", "radium radium");
    await env.DB.prepare("INSERT INTO sign_in_failures VALUES ('someoneelse', 5, ?)")
      .bind(Date.now())
      .run();
    expect(
      (await post("/api/auth/signin", { username: "Curie", password: "radium radium" })).status,
    ).toBe(200);
  });
});

describe("sessions", () => {
  it("slide: a session used after a day is extended to 30 days and the cookie re-sent", async () => {
    const { cookie } = await signUp("Hypatia");
    const mine = "account_id = (SELECT id FROM accounts WHERE username_key = 'hypatia')";
    await env.DB.prepare(`UPDATE sessions SET expires_at = ? WHERE ${mine}`)
      .bind(Date.now() + 10 * 24 * 60 * 60 * 1000)
      .run();
    const res = await meWith(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
    const row = await env.DB.prepare(`SELECT expires_at FROM sessions WHERE ${mine}`).first<{
      expires_at: number;
    }>();
    expect((row?.expires_at ?? 0) - Date.now()).toBeGreaterThan(SESSION_TTL_MS - 60_000);
  });

  it("expire: an expired session is rejected and removed", async () => {
    const { cookie } = await signUp("Kovalevskaya");
    const mine = "account_id = (SELECT id FROM accounts WHERE username_key = 'kovalevskaya')";
    await env.DB.prepare(`UPDATE sessions SET expires_at = 1 WHERE ${mine}`).run();
    expect(await (await meWith(cookie)).json()).toEqual({ account: null });
    expect(
      await env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE ${mine}`).first(),
    ).toEqual({ n: 0 });
  });
});
