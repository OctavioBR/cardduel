import { CLOSE_SIGNED_OUT } from "@card-duel/engine";
import { me, signIn, signOut, signUp } from "./auth/routes";
import { readSession } from "./auth/session";
import { handleDecks } from "./decks";
import { json } from "./http";
import { ACCOUNT_ID_HEADER, USERNAME_HEADER } from "./room";
import { generateRoomCode, normaliseRoomCode } from "./room-code";

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
  if (request.method === "POST" && pathname === "/api/auth/signup") return signUp(request, env.DB);
  if (request.method === "POST" && pathname === "/api/auth/signin") return signIn(request, env.DB);
  if (request.method === "POST" && pathname === "/api/auth/signout")
    return signOut(request, env.DB);
  if (request.method === "GET" && pathname === "/api/me") return me(request, env.DB);
  if (pathname === "/api/decks" || pathname.startsWith("/api/decks/")) {
    const session = await readSession(env.DB, request);
    if (!session) return json({ error: "signed_out", message: "Sign in first." }, { status: 401 });
    const response = await handleDecks(
      request,
      env.DB,
      session.account,
      pathname.slice("/api/decks".length),
    );
    if (session.refreshedCookie) response.headers.append("Set-Cookie", session.refreshedCookie);
    return response;
  }
  if (pathname === "/api/rooms" && request.method === "POST") {
    return createRoom(request, env);
  }
  const ws = pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
  if (ws && request.method === "GET") {
    const code = normaliseRoomCode(decodeURIComponent(ws[1] ?? ""));
    if (!code) return json({ error: "room_not_found" }, { status: 404 });
    const session = await readSession(env.DB, request);
    if (!session) return closedSocket(CLOSE_SIGNED_OUT, "signed_out", "Sign in to take a Seat.");
    // The Room trusts only these headers, set here from the checked session.
    const headers = new Headers(request.headers);
    headers.set(ACCOUNT_ID_HEADER, session.account.id);
    headers.set(USERNAME_HEADER, session.account.username);
    return env.ROOMS.getByName(code).fetch(new Request(request, { headers }));
  }
  return json({ error: "not_found" }, { status: 404 });
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  // Creating a Room requires signing in; the creator chooses Casual or Competitive.
  const session = await readSession(env.DB, request);
  if (!session)
    return json({ error: "signed_out", message: "Sign in to create a Room." }, { status: 401 });
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
