import { me, signIn, signOut, signUp } from "./auth/routes";
import { json } from "./http";
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
  if (pathname === "/api/rooms" && request.method === "POST") {
    return createRoom(env);
  }
  const ws = pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
  if (ws && request.method === "GET") {
    const code = normaliseRoomCode(decodeURIComponent(ws[1] ?? ""));
    if (!code) return json({ error: "room_not_found" }, { status: 404 });
    return env.ROOMS.getByName(code).fetch(request);
  }
  return json({ error: "not_found" }, { status: 404 });
}

async function createRoom(env: Env): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    if (await env.ROOMS.getByName(code).create(code)) {
      return json({ code }, { status: 201 });
    }
  }
  return json({ error: "no_free_code" }, { status: 503 });
}
