# Clerk authentication setup

Card Duel uses Clerk for email/password sign-in, verification, password recovery, password changes and Google sign-in. D1 owns player IDs, Display names, Decks and Records. Display names may repeat and never identify ownership.

## Create the application

1. Create a Clerk application. Under **User & authentication**, enable **Email** and **Password**. Require email verification. Leave usernames optional/disabled: the game asks for its own Display name after authentication.
2. Enable **Google** under **SSO connections** for both sign-in and sign-up. Clerk development instances can use the shared Google credentials. For production, create your Google OAuth client and enter its client ID/secret in Clerk, using the exact redirect URI Clerk provides. Add the required authorized domain and production application URLs in Clerk. The game uses Clerk's Google flow; do not register a separate Worker OAuth callback.
3. Obtain the **publishable key**, **secret key**, and optional **JWT public key** from the application's API keys settings. Use separate development and production instances and matching keys. Never use the committed test signing key with a real application.

Clerk's `<SignIn>` provides “Forgot password?” and its `<UserProfile>` provides password updates. The game's **Account settings** page includes that component alongside the Display name editor. Recovery requires an accessible verified email; Google account passwords are changed through Google.

## Local development

Create `apps/web/.env.local` (ignored):

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key
```

Create `apps/worker/.dev.vars` (ignored):

```dotenv
CLERK_PUBLISHABLE_KEY=pk_test_your_key
CLERK_SECRET_KEY=sk_test_your_key
APP_ORIGIN=http://localhost:5173,http://localhost:8787
# Optional: copy the matching PEM public key, with escaped newlines, for networkless verification.
# CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Run `pnpm dev`. The Worker dev script preserves the localhost origin instead of inferring the production Custom Domain. Vite proxies the API and Room WebSockets to the Worker. Keep the allowed origins explicit; do not include arbitrary preview domains. The Worker rejects cross-origin mutations and WebSocket upgrades. The local profile is created on the first verified `/api/me` request, and an incomplete profile must choose a Display name before accessing Decks or Rooms.

If sign-up succeeds but the game cannot verify the sign-in, check the response to `/api/me`. On localhost only, the `X-Card-Duel-Auth` response header gives a non-sensitive SDK reason code. `publishable-key-invalid` means the Worker's `CLERK_PUBLISHABLE_KEY` is malformed: copy the same `pk_test_…` value used by the frontend, keeping the separate `sk_test_…` secret in `CLERK_SECRET_KEY`, and restart `pnpm dev`. Missing or malformed configuration returns 503; a rejected session returns `account: null`. These cases have separate messages from a network failure. Never share request cookies or Authorization headers when reporting a problem.

## Production

1. Configure the production Clerk instance and Google OAuth connection. Deploy neither development nor test-fixture keys to production.
2. Set GitHub repository variable `CLERK_PUBLISHABLE_KEY` to the production publishable key, alongside the existing `PRODUCTION_URL`. CI passes the publishable key to Vite and sets the Worker's `CLERK_PUBLISHABLE_KEY` and `APP_ORIGIN` during deploy. A missing publishable key or production origin stops deployment before migrations run. CI also checks that the Worker secret exists before applying migrations.
3. Set the Worker secret from `apps/worker` using `pnpm exec wrangler secret put CLERK_SECRET_KEY`. Optionally set `CLERK_JWT_KEY` with the matching PEM public key. When pinning that public key, update it during Clerk signing-key rotation; omitting it lets the SDK fetch and cache keys using the secret key.
4. Review migration `0003_clerk_accounts.sql`. It preserves existing rows in `legacy_*` tables and starts fresh active tables. It does not import old users or erase archived data. Existing Matches may be interrupted: pre-Clerk Rooms close on their next event and stop their alarms, retaining stored Room state. Old accounts cannot sign in to the new application; no account-linking UI is implemented. A rollback requires restoring the previous schema/application together, rather than merely deploying the old Worker against the new tables.
5. CI applies D1 migrations through Wrangler and deploys after the required checks. Keep Clerk secrets out of Git, Vite variables and build logs.

Before enabling production, smoke-test email/password registration and verification, password reset, password changes, Google sign-in/cancellation, sign-out, a Room return link, duplicate Display names, and two players taking Seats. Measure cold/warm Worker authentication CPU against the Free plan limit. No production Clerk instance was provisioned by this change.

## Automated tests

`pnpm check` runs type checking, lint, unit/Worker tests and Playwright. Install Chromium once with `pnpm --filter @card-duel/web exec playwright install chromium`.

The Worker tests validate actual RS256 session signatures, issuer, expiry and authorized-party claims using a dedicated public test key. Playwright runs Vite in explicit `test` mode, replacing Clerk's remote UI with a controlled fixture. A Playwright route signs fixture sessions outside the browser; the Worker still runs the production verification code. The generated ignored `wrangler.e2e.json` supplies test-only credentials and the local origin. Playwright assets are built into the ignored `dist-e2e` directory, leaving production `dist` untouched. Normal Vite builds always use the real Clerk SDK. These tests cover game integration; they do not claim to exercise Google's consent screen, Clerk email delivery or Clerk's remote UI accessibility. The documented real-provider smoke test covers those boundaries.

Playwright supplies an explicit empty Worker environment and stores its local D1 data in `.wrangler/e2e`, so a developer's `.dev.vars` and development database do not affect the test provider.

Official references: [React setup](https://clerk.com/docs/react/getting-started/quickstart), [password recovery](https://clerk.com/docs/guides/development/custom-flows/authentication/forgot-password), [session verification](https://clerk.com/docs/reference/backend/authenticate-request).
