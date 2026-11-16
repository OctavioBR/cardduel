const KEY = "card-duel.player-token";

/** A random per-browser player token, until accounts exist (Milestone 6). */
export function playerToken(storage: Storage = window.localStorage): string {
  try {
    const existing = storage.getItem(KEY);
    if (existing) return existing;
    const token = crypto.randomUUID();
    storage.setItem(KEY, token);
    return token;
  } catch {
    return crypto.randomUUID();
  }
}
