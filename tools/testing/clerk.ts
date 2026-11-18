import keys from "./clerk-keys.json" with { type: "json" };
export const publishableKey = "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk";
export const publicKey = keys.publicKey;
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function sessionToken(
  userId: string,
  origin: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    new TextEncoder().encode(
      JSON.stringify({ alg: "RS256", typ: "JWT", cat: "cl_B7d4PD111AAA", kid: "test-only" }),
    ),
  );
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        v: 2,
        iss: "https://test.clerk.accounts.dev",
        sub: userId,
        sid: `sess_${userId}`,
        azp: origin,
        iat: now,
        nbf: now - 5,
        exp: now + 3600,
        fva: [0, -1],
        ...overrides,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(keys.privateKey.replace(/-----[^-]+-----|\s/g, "")), (char) =>
      char.charCodeAt(0),
    ),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}
