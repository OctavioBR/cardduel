import { CLOSE_SIGNED_OUT } from "@card-duel/engine";
import { me, updateProfile } from "./auth/routes";
import { readSession } from "./auth/session";
import { handleDecks } from "./decks";
import { json } from "./http";
import { ACCOUNT_ID_HEADER, DISPLAY_NAME_HEADER } from "./room";
import { generateRoomCode, normaliseRoomCode } from "./room-code";
import copy from "./strings/en.json";

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
    const record = await env.DB.prepare(
      "SELECT wins, losses, draws, disconnect_wins AS disconnectWins, disconnect_losses AS disconnectLosses FROM records WHERE account_id = ?",
    )
      .bind(session.account.id)
      .first();
    const response = json({ record });
    return response;
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
    const session = await readSession(env.DB, request, env);
    if (!session) return closedSocket(CLOSE_SIGNED_OUT, "signed_out", copy.signInToTakeASeat);
    if (!session.account.displayName)
      return closedSocket(CLOSE_SIGNED_OUT, "profile_incomplete", copy.chooseDisplayName);
    // The Room trusts only these headers, set here from the checked session.
    const headers = new Headers(request.headers);
    headers.set(ACCOUNT_ID_HEADER, session.account.id);
    headers.set(DISPLAY_NAME_HEADER, encodeURIComponent(session.account.displayName));
    return env.ROOMS.getByName(code).fetch(new Request(request, { headers }));
  }
  return json({ error: "not_found" }, { status: 404 });
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  // Creating a Room requires signing in; the creator chooses Casual or Competitive.
  const session = await readSession(env.DB, request, env);
  if (!session)
    return json({ error: "signed_out", message: copy.signInToCreateARoom }, { status: 401 });
  if (!session.account.displayName)
    return json({ error: "profile_incomplete", message: copy.chooseDisplayName }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { competitive?: unknown };
  const competitive = body.competitive === true;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    if (await env.ROOMS.getByName(code).create(code, competitive)) {
      return json({ code, competitive }, { status: 201 });
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
