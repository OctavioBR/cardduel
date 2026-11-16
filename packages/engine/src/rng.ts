/**
 * Seeded pseudo-random generator (mulberry32). The engine's only source of randomness
 * (ADR-0003): its whole state is one uint32 kept on the Match state, so it survives
 * snapshots and replays.
 */
export interface RngHolder {
  rng: number;
}

/** Returns a float in [0, 1) and advances the holder's generator. */
export function nextFloat(holder: RngHolder): number {
  const s = (holder.rng + 0x6d2b79f5) | 0;
  holder.rng = s >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns an integer in [0, n). */
export function nextInt(holder: RngHolder, n: number): number {
  return Math.floor(nextFloat(holder) * n);
}

/** Fisher-Yates shuffle in place. */
export function shuffle<T>(holder: RngHolder, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}

/** Normalises any number into a valid uint32 seed. */
export function toSeed(seed: number): number {
  return (Math.trunc(seed) >>> 0) as number;
}
