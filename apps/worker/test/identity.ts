import { SELF } from "cloudflare:test";
import { sessionToken } from "../../../tools/testing/clerk";

export { sessionToken } from "../../../tools/testing/clerk";
export const BASE = "https://card-duel.test";
export async function newIdentity(displayName = "Player") {
  const cookie = `__clerk_db_jwt=fixture; __client_uat=1; __session=${await sessionToken(`user_${crypto.randomUUID()}`, BASE)}`;
  const response = await SELF.fetch(`${BASE}/api/me/profile`, {
    method: "PATCH",
    headers: { Cookie: cookie, Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok)
    throw new Error(`Profile setup failed: ${response.status} ${await response.text()}`);
  return cookie;
}
