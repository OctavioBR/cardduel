import { json } from "../http";
import copy from "../strings/en.json";
import { formatCopy } from "../strings/format";
import { hashPassword, verifyPassword } from "./password";
import {
  type Account,
  clearedSessionCookie,
  createSession,
  deleteSession,
  readSession,
} from "./session";

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;
/** Failed sign-ins allowed per username within the window before throttling. */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;

interface Credentials {
  username: string;
  password: string;
}

async function readCredentials(request: Request): Promise<Credentials | Response> {
  // JSON only: together with SameSite=Lax this keeps cross-site form posts out.
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return json({ error: "bad_request", message: copy.sendJSON }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as Partial<Credentials> | null;
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return json(
      { error: "bad_request", message: copy.usernameAndPasswordAreRequired },
      { status: 400 },
    );
  }
  return { username: body.username.trim(), password: body.password };
}

function withCookie(response: Response, cookie: string): Response {
  response.headers.append("Set-Cookie", cookie);
  return response;
}

export async function signUp(request: Request, db: D1Database): Promise<Response> {
  const creds = await readCredentials(request);
  if (creds instanceof Response) return creds;
  if (!USERNAME_PATTERN.test(creds.username)) {
    return json(
      {
        error: "invalid_username",
        message: copy.usernamesAre3To20Letters,
      },
      { status: 400 },
    );
  }
  if (creds.password.length < MIN_PASSWORD_LENGTH) {
    return json(
      {
        error: "invalid_password",
        message: formatCopy(copy.passwordsNeedAtLeastCharacters, { p0: MIN_PASSWORD_LENGTH }),
      },
      { status: 400 },
    );
  }
  const key = creds.username.toLowerCase();
  const taken = await db.prepare("SELECT 1 FROM accounts WHERE username_key = ?").bind(key).first();
  if (taken)
    return json({ error: "username_taken", message: copy.thatUsernameIsTaken }, { status: 409 });

  const stored = await hashPassword(creds.password);
  const account: Account = { id: crypto.randomUUID(), username: creds.username };
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO accounts (id, username, username_key, password_hash, password_salt, password_iterations, password_algorithm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          account.id,
          account.username,
          key,
          stored.hash,
          stored.salt,
          stored.iterations,
          stored.algorithm,
          Date.now(),
        ),
      db.prepare("INSERT INTO records (account_id) VALUES (?)").bind(account.id),
    ]);
  } catch {
    // Lost a race with another sign-up for the same name.
    return json({ error: "username_taken", message: copy.thatUsernameIsTaken }, { status: 409 });
  }
  const cookie = await createSession(db, account.id);
  return withCookie(json({ account }, { status: 201 }), cookie);
}

export async function signIn(request: Request, db: D1Database): Promise<Response> {
  const creds = await readCredentials(request);
  if (creds instanceof Response) return creds;
  const key = creds.username.toLowerCase();
  const now = Date.now();

  const failures = await db
    .prepare("SELECT failures, window_start FROM sign_in_failures WHERE username_key = ?")
    .bind(key)
    .first<{ failures: number; window_start: number }>();
  const inWindow = failures && now - failures.window_start < FAILURE_WINDOW_MS;
  if (inWindow && failures.failures >= MAX_FAILURES) {
    const retryAfter = Math.ceil((failures.window_start + FAILURE_WINDOW_MS - now) / 1000);
    const response = json(
      { error: "throttled", message: copy.tooManyFailedSignInsTry },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(retryAfter));
    return response;
  }

  const row = await db
    .prepare(
      "SELECT id, username, password_hash, password_salt, password_iterations, password_algorithm FROM accounts WHERE username_key = ?",
    )
    .bind(key)
    .first<{
      id: string;
      username: string;
      password_hash: string;
      password_salt: string;
      password_iterations: number;
      password_algorithm: string;
    }>();
  const ok =
    row !== null &&
    (await verifyPassword(creds.password, {
      hash: row.password_hash,
      salt: row.password_salt,
      iterations: row.password_iterations,
      algorithm: row.password_algorithm,
    }));

  if (!ok || !row) {
    const record = inWindow
      ? db
          .prepare("UPDATE sign_in_failures SET failures = failures + 1 WHERE username_key = ?")
          .bind(key)
      : db
          .prepare(
            "INSERT INTO sign_in_failures (username_key, failures, window_start) VALUES (?1, 1, ?2) ON CONFLICT(username_key) DO UPDATE SET failures = 1, window_start = ?2",
          )
          .bind(key, now);
    await record.run();
    return json(
      { error: "invalid_credentials", message: copy.wrongUsernameOrPassword },
      { status: 401 },
    );
  }

  await db.prepare("DELETE FROM sign_in_failures WHERE username_key = ?").bind(key).run();
  const cookie = await createSession(db, row.id);
  return withCookie(json({ account: { id: row.id, username: row.username } }), cookie);
}

export async function signOut(request: Request, db: D1Database): Promise<Response> {
  await deleteSession(db, request);
  return withCookie(json({ ok: true }), clearedSessionCookie());
}

export async function me(request: Request, db: D1Database): Promise<Response> {
  const session = await readSession(db, request);
  // Signed out is a normal state, not an error: answer 200 with no account.
  if (!session) return json({ account: null });
  const response = json({ account: session.account });
  return session.refreshedCookie ? withCookie(response, session.refreshedCookie) : response;
}
