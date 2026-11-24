/** A Recently Active Player did something in the game within this window (#119). */
export const ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
/** An account's last activity is written at most this often, to spend few D1 writes. */
export const ACTIVITY_THROTTLE_MS = 60 * 1000;

/** Whether activity seen at `lastSeen` is old enough to be written again. */
export function activityIsStale(lastSeen: number | null, now: number): boolean {
  return lastSeen === null || now - lastSeen >= ACTIVITY_THROTTLE_MS;
}

/**
 * Records that an account is active now. The condition repeats the throttle in D1, so a
 * caller that lost track of the last write (a woken Room) still writes no row when fresh.
 */
export async function recordActivity(
  db: D1Database,
  accountId: string,
  now = Date.now(),
): Promise<void> {
  await db
    .prepare(
      "UPDATE accounts SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen <= ?)",
    )
    .bind(now, accountId, now - ACTIVITY_THROTTLE_MS)
    .run();
}

/**
 * How many Recently Active Players there are now, always counting the viewer: their own
 * activity may still be on its way to D1.
 */
export async function countRecentlyActive(
  db: D1Database,
  viewerId: string,
  now = Date.now(),
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM accounts WHERE last_seen > ? OR id = ?")
    .bind(now - ACTIVITY_WINDOW_MS, viewerId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}
