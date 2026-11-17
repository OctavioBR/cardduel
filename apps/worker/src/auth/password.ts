/**
 * Password hashing with PBKDF2-SHA256 through WebCrypto (ADR-0005). The Workers runtime caps
 * iterations at 100k; the Free plan allows 10 ms of CPU per request (ADR-0001).
 * Measured in production: 50k iterations made sign-in cost 19-21 ms of CPU, about 4x a
 * laptop. 20k (about 8 ms) is what fits the Free plan, below current PBKDF2-SHA256 guidance
 * (ADR-0007). Each stored hash records its parameters, and sign-in re-hashes any account
 * stored at another count, so the count can change (up on Workers Paid) without breaking
 * old accounts.
 */
export const PBKDF2_ITERATIONS = 20_000;
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

/** True when a verified hash should be replaced by one at the current iteration count. */
export function needsRehash(stored: Pick<StoredPassword, "iterations">): boolean {
  return stored.iterations !== PBKDF2_ITERATIONS;
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
