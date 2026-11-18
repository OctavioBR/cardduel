import { createClerkClient } from "@clerk/backend";

// Intersect with generated bindings so local .dev.vars inference may also declare these keys.
type ClerkEnv = Env & { CLERK_SECRET_KEY?: string; CLERK_JWT_KEY?: string };

export interface Account {
  id: string;
  displayName: string | null;
}

/** Identity comes only from a verified Clerk session. D1 stores the game profile. */
export async function readSession(
  db: D1Database,
  request: Request,
  env: ClerkEnv,
): Promise<{ account: Account } | null> {
  if (!env.CLERK_PUBLISHABLE_KEY || !env.APP_ORIGIN || !env.CLERK_SECRET_KEY) return null;
  // Pin the issuer to this instance as well as checking signature and authorized party.
  let userId: string | null;
  try {
    const clerk = createClerkClient({
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY || undefined,
      jwtKey: env.CLERK_JWT_KEY || undefined,
    });
    const encoded = env.CLERK_PUBLISHABLE_KEY.replace(/^pk_(test|live)_/, "");
    const issuer = `https://${atob(encoded).replace(/\$$/, "")}`;
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: env.APP_ORIGIN.split(",").map((origin) => origin.trim()),
      issuer,
    });
    userId = state.isAuthenticated ? state.toAuth().userId : null;
  } catch {
    return null;
  }
  if (!userId) return null;
  const select = () =>
    db
      .prepare("SELECT id, display_name AS displayName FROM accounts WHERE clerk_user_id = ?")
      .bind(userId)
      .first<Account>();
  let account = await select();
  if (!account) {
    await db.batch([
      db
        .prepare(
          "INSERT INTO accounts (id, clerk_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(clerk_user_id) DO NOTHING",
        )
        .bind(crypto.randomUUID(), userId, Date.now()),
      db
        .prepare(
          "INSERT INTO records (account_id) SELECT id FROM accounts WHERE clerk_user_id = ? ON CONFLICT(account_id) DO NOTHING",
        )
        .bind(userId),
    ]);
    account = await select();
  }
  return account ? { account } : null;
}
