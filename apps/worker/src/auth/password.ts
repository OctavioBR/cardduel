/**
 * Password hashing with PBKDF2-SHA256 through WebCrypto (ADR-0005). The Workers runtime caps
 * iterations at 100k; the Free plan allows about 10 ms of CPU per request (ADR-0001).
 * Measured: 100k iterations take about 9.7 ms, 50k about 4.9 ms on a laptop, so 50k leaves
 * room for the rest of a sign-in. Each stored hash records its parameters, so the count can
 * rise (on Workers Paid) without breaking old accounts.
 */
export const PBKDF2_ITERATIONS = 50_000;
export const PASSWORD_ALGORITHM = "PBKDF2-SHA256";
const SALT_BYTES = 16;
const HASH_BITS = 256;

export interface StoredPassword {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: string;
}

export async function hashPassword(
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<StoredPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return { hash: toBase64(hash), salt: toBase64(salt), iterations, algorithm: PASSWORD_ALGORITHM };
}

export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  if (stored.algorithm !== PASSWORD_ALGORITHM) return false;
  const actual = await derive(password, fromBase64(stored.salt), stored.iterations);
  const expected = fromBase64(stored.hash);
  return timingSafeEqual(actual, expected);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
