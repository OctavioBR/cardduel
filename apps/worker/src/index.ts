import {
  CLOSE_SIGNED_OUT,
  MAX_TURN_TIMER_SECONDS,
  MIN_TURN_TIMER_SECONDS,
} from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { countRecentlyActive } from "./activity";
import { me, updateProfile } from "./auth/routes";
import { readSession } from "./auth/session";
import { handleDecks } from "./decks";
import { ACCOUNT_ID_HEADER, DISPLAY_NAME_HEADER } from "./headers";
import { json } from "./http";
import { MATCHMAKER_NAME } from "./matchmaker";
import { generateRoomCode, normaliseRoomCode } from "./room-code";
import copy from "./strings/en.json";

export { Matchmaker } from "./matchmaker";
export { Room } from "./room";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;
  if (pathname === "/api/health" && request.method === "GET") {
    return json({ status: "ok" });
  }
  // Cookies authenticate HTTP and WebSockets: reject cross-origin state changes/upgrades.
  if (!["GET", "HEAD"].includes(request.method) || request.headers.get("Upgrade") === "websocket") {
    const origin = request.headers.get("Origin");
    const allowed = (env.APP_ORIGIN ?? "").split(",").map((value) => value.trim());
    if (!origin || !allowed.includes(origin))
      return json({ error: "forbidden", message: copy.requestNotAllowed }, { status: 403 });
  }
  if (request.method === "GET" && pathname === "/api/me") return me(request, env);
  if (request.method === "PATCH" && pathname === "/api/me/profile")
    return updateProfile(request, env);
  if (pathname === "/api/record" && request.method === "GET") {
    const session = await readSession(env.DB, request, env);
    if (!session) return json({ error: "signed_out", message: copy.signInFirst }, { status: 401 });
    const [record, recentlyActive] = await Promise.all([
      env.DB.prepare(
        "SELECT wins, losses, draws, disconnect_wins AS disconnectWins, disconnect_losses AS disconnectLosses FROM records WHERE account_id = ?",
      )
        .bind(session.account.id)
        .first(),
      // Home shows the Recently Active Players with the Record, so it needs no request of its own.
      countRecentlyActive(env.DB, session.account.id),
    ]);
    return json({ record, recentlyActive });
  }
  if (pathname === "/api/decks" || pathname.startsWith("/api/decks/")) {
    const session = await readSession(env.DB, request, env);
    if (!session) return json({ error: "signed_out", message: copy.signInFirst }, { status: 401 });
    if (!session.account.displayName)
      return json(
        { error: "profile_incomplete", message: copy.chooseDisplayName },
        { status: 403 },
      );
    const response = await handleDecks(
      request,
      env.DB,
      session.account,
      pathname.slice("/api/decks".length),
    );
    return response;
  }
  if (pathname === "/api/rooms" && request.method === "POST") {
    return createRoom(request, env);
  }
  const ws = pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
  if (ws && request.method === "GET") {
    const code = normaliseRoomCode(decodeURIComponent(ws[1] ?? ""));
    if (!code) return json({ error: "room_not_found" }, { status: 404 });
    return forwardSocket(request, env, env.ROOMS.getByName(code));
  }
  if (pathname === "/api/matchmaking/ws" && request.method === "GET") {
    return forwardSocket(request, env, env.MATCHMAKER.getByName(MATCHMAKER_NAME));
  }
  return json({ error: "not_found" }, { status: 404 });
}

/** Passes a signed-in player's WebSocket to a Room or the Matchmaker. */
async function forwardSocket(
  request: Request,
  env: Env,
  target: { fetch(request: Request): Promise<Response> },
): Promise<Response> {
  const session = await readSession(env.DB, request, env);
  if (!session) return closedSocket(CLOSE_SIGNED_OUT, "signed_out", copy.signInToTakeASeat);
  if (!session.account.displayName)
    return closedSocket(CLOSE_SIGNED_OUT, "profile_incomplete", copy.chooseDisplayName);
  // Rooms and the Matchmaker trust only these headers, set here from the checked session.
  const headers = new Headers(request.headers);
  headers.set(ACCOUNT_ID_HEADER, session.account.id);
  headers.set(DISPLAY_NAME_HEADER, encodeURIComponent(session.account.displayName));
  return target.fetch(new Request(request, { headers }));
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  // Creating a Room requires signing in; the creator chooses Casual or Competitive.
  const session = await readSession(env.DB, request, env);
  if (!session)
    return json({ error: "signed_out", message: copy.signInToCreateARoom }, { status: 401 });
  if (!session.account.displayName)
    return json({ error: "profile_incomplete", message: copy.chooseDisplayName }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as {
    competitive?: unknown;
    turnTimer?: unknown;
  };
  const competitive = body.competitive === true;
  // A Turn Timer is optional in created Rooms: null or absent means none (#109).
  const turnTimer = body.turnTimer ?? null;
  if (
    turnTimer !== null &&
    (typeof turnTimer !== "number" ||
      !Number.isInteger(turnTimer) ||
      turnTimer < MIN_TURN_TIMER_SECONDS ||
      turnTimer > MAX_TURN_TIMER_SECONDS)
  )
    return json(
      {
        error: "bad_request",
        message: formatCopy(copy.turnTimerRange, {
          p0: MIN_TURN_TIMER_SECONDS,
          p1: MAX_TURN_TIMER_SECONDS,
        }),
      },
      { status: 400 },
    );
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    if (await env.ROOMS.getByName(code).create(code, competitive, turnTimer)) {
      return json({ code, competitive, turnTimer }, { status: 201 });
    }
  }
  return json({ error: "no_free_code" }, { status: 503 });
}

/** A WebSocket that is accepted only to say why it closes (the client cannot read HTTP errors). */
function closedSocket(code: number, error: string, message: string): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  server.send(JSON.stringify({ type: "error", code: error, message }));
  server.close(code, message);
  return new Response(null, { status: 101, webSocket: client });
}
