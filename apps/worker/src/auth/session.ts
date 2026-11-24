import { waitUntil } from "cloudflare:workers";
import { createClerkClient } from "@clerk/backend";
import { activityIsStale, recordActivity } from "../activity";
import { starterDeck } from "../starter-decks";

// Intersect with generated bindings so local .dev.vars inference may also declare these keys.
type ClerkEnv = Env & { CLERK_SECRET_KEY?: string; CLERK_JWT_KEY?: string };

export interface Account {
  id: string;
  displayName: string | null;
}

/**
 * Identity comes only from a verified Clerk session. D1 stores the game profile. Every
 * signed-in request also counts as activity for Recently Active Players (#119).
 */
export async function readSession(
  db: D1Database,
  request: Request,
  env: ClerkEnv,
  diagnose?: (reason: string) => void,
): Promise<{ account: Account } | null> {
  if (!env.CLERK_PUBLISHABLE_KEY || !env.APP_ORIGIN || !env.CLERK_SECRET_KEY) {
    diagnose?.("configuration-missing");
    return null;
  }
  // Pin the issuer to this instance as well as checking signature and authorized party.
  let userId: string | null;
  try {
    const publishableKey = env.CLERK_PUBLISHABLE_KEY.trim();
    if (!/^pk_(test|live)_/.test(publishableKey)) {
      diagnose?.("publishable-key-invalid");
      return null;
    }
    const clerk = createClerkClient({
      publishableKey,
      secretKey: env.CLERK_SECRET_KEY || undefined,
      jwtKey: env.CLERK_JWT_KEY || undefined,
    });
    const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
    let issuer: string;
    try {
      const decoded = atob(encoded);
      if (!decoded.endsWith("$")) throw new Error("Invalid publishable key format");
      issuer = `https://${decoded.slice(0, -1)}`;
    } catch {
      diagnose?.("publishable-key-invalid");
      return null;
    }
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: env.APP_ORIGIN.split(",").map((origin) => origin.trim()),
      issuer,
    });
    userId = state.isAuthenticated ? state.toAuth().userId : null;
    if (!userId) diagnose?.(state.reason ?? "session-inactive");
  } catch (error) {
    diagnose?.(`verification-error-${error instanceof Error ? error.name : "unknown"}`);
    return null;
  }
  if (!userId) return null;
  const select = () =>
    db
      .prepare(
        "SELECT id, display_name AS displayName, last_seen AS lastSeen FROM accounts WHERE clerk_user_id = ?",
      )
      .bind(userId)
      .first<Account & { lastSeen: number | null }>();
  let account = await select();
  if (!account) {
    const accountId = crypto.randomUUID();
    const now = Date.now();
    await db.batch([
      db
        .prepare(
          "INSERT INTO accounts (id, clerk_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(clerk_user_id) DO NOTHING",
        )
        .bind(accountId, userId, now),
      db
        .prepare(
          "INSERT INTO records (account_id) SELECT id FROM accounts WHERE clerk_user_id = ? ON CONFLICT(account_id) DO NOTHING",
        )
        .bind(userId),
      ...(["swarm", "court"] as const).map((faction) => {
        const deck = starterDeck(faction);
        return db
          .prepare(
            "INSERT INTO decks (id, account_id, name, faction, leader, cards, updated_at) SELECT ?, id, ?, ?, ?, ?, ? FROM accounts WHERE id = ?",
          )
          .bind(
            crypto.randomUUID(),
            deck.name,
            deck.faction,
            deck.leader,
            JSON.stringify(deck.cards),
            now,
            // Only the request that inserted this account seeds its Starter Decks.
            accountId,
          );
      }),
    ]);
    account = await select();
  }
  if (!account) return null;
  const { lastSeen, ...profile } = account;
  // Written after the response, and only once a minute per account.
  if (activityIsStale(lastSeen, Date.now())) waitUntil(recordActivity(db, profile.id));
  return { account: profile };
}
