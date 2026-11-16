/** An HttpOnly session cookie backed by the sessions table, with a 30-day sliding expiry. */
export const SESSION_COOKIE = "cd_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions are extended at most once a day, to keep writes down. */
const EXTEND_AFTER_MS = 24 * 60 * 60 * 1000;

export interface Account {
  id: string;
  username: string;
}

export interface Session {
  account: Account;
  /** A Set-Cookie value when the session was just extended. */
  refreshedCookie: string | null;
}

export async function createSession(
  db: D1Database,
  accountId: string,
  now = Date.now(),
): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO sessions (id, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sessionId(token), accountId, now, now + SESSION_TTL_MS)
    .run();
  return sessionCookie(token);
}

/** The signed-in account for a request, extending the session when it is due. */
export async function readSession(
  db: D1Database,
  request: Request,
  now = Date.now(),
): Promise<Session | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const id = await sessionId(token);
  const row = await db
    .prepare(
      "SELECT s.expires_at AS expires_at, a.id AS id, a.username AS username FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = ?",
    )
    .bind(id)
    .first<{ expires_at: number; id: string; username: string }>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  let refreshedCookie: string | null = null;
  if (row.expires_at - now < SESSION_TTL_MS - EXTEND_AFTER_MS) {
    await db
      .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(now + SESSION_TTL_MS, id)
      .run();
    refreshedCookie = sessionCookie(token);
  }
  return { account: { id: row.id, username: row.username }, refreshedCookie };
}

export async function deleteSession(db: D1Database, request: Request): Promise<void> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token)
    await db
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(await sessionId(token))
      .run();
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Sessions are stored by a SHA-256 of the token, so a database leak does not leak cookies. */
async function sessionId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
