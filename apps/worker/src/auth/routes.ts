import { json } from "../http";
import copy from "../strings/en.json";
import { readSession } from "./session";

export async function me(request: Request, env: Env): Promise<Response> {
  let reason = "authenticated";
  const session = await readSession(env.DB, request, env, (value) => {
    reason = value;
  });
  const configurationError =
    reason === "configuration-missing" || reason === "publishable-key-invalid";
  const response = configurationError
    ? json({ error: "auth_unavailable", message: copy.signInUnavailable }, { status: 503 })
    : json({ account: session?.account ?? null });
  // Local diagnostics report only SDK reason codes, never credentials or token claims.
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    response.headers.set("X-Card-Duel-Auth", reason);
  }
  return response;
}

export function validDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().normalize("NFC");
  if (!name || [...name].length > 30 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name)) return null;
  return name;
}

export async function updateProfile(request: Request, env: Env): Promise<Response> {
  const session = await readSession(env.DB, request, env);
  if (!session) return json({ error: "signed_out", message: copy.signInFirst }, { status: 401 });
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    return json({ error: "bad_request", message: copy.sendJSON }, { status: 415 });
  const body = (await request.json().catch(() => null)) as { displayName?: unknown } | null;
  const displayName = validDisplayName(body?.displayName);
  if (!displayName)
    return json(
      { error: "invalid_display_name", message: copy.invalidDisplayName },
      { status: 400 },
    );
  await env.DB.prepare("UPDATE accounts SET display_name = ? WHERE id = ?")
    .bind(displayName, session.account.id)
    .run();
  return json({ account: { ...session.account, displayName } });
}
