import { json } from "./http";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, url);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function handleApi(request: Request, url: URL): Response {
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ status: "ok" });
  }
  return json({ error: "not_found" }, { status: 404 });
}
