# Delegate authentication to Clerk and keep game profiles in D1

Clerk handles email/password registration, email verification, password reset and changes, Google sign-in, and session lifecycle. The client uses Clerk's React components. The Worker verifies Clerk session tokens through the backend SDK, pins the instance issuer and allowed application origins, and resolves the provider identity to an immutable local account ID. Game data remains in D1.

This supersedes ADR-0005's in-house authentication and no-email decisions, and ADR-0007's password-hashing decision. The game no longer stores or hashes new passwords. Clerk holds authentication identifiers such as email; the public game profile does not publish them.

The player chooses a Display name after their first sign-in and can edit it in account settings. It accepts Unicode and spaces, is limited to 30 code points after trimming and NFC normalization, excludes controls and line breaks, and need not be unique. Ownership, authorization, Seats and Records always use account IDs.

Existing users and password hashes are not imported. Migration 0003 archives the old accounts, sessions, Decks, Records and Match results under `legacy_*` names, preserving their foreign-key relationships, and creates fresh game tables for Clerk accounts. The user accepts interruption of existing Matches during this cutover. Pre-Clerk Rooms close their sockets and stop their alarms when next loaded, retaining their stored state without writing results against the new accounts. Old account access and old Rooms are not supported by the new authentication flow. Removing archived data is a separate decision.

## Consequences

- Clerk is an external authentication dependency. Its free-plan limits and availability affect sign-in; its seven-day free-plan session duration replaces the old 30-day application session.
- Email/password recovery and updates use Clerk's components, including email delivery. Google-only credentials remain managed by Google.
- The Clerk dashboard must enable email/password and Google, with production OAuth credentials configured before rollout. See [setup](../authentication.md).
- The Worker requires a secret key for the SDK and may use the instance's public JWT verification key for networkless verification. JWT verification caches remote keys when a public key is not supplied. Authorization remains the game's responsibility; local verification may accept a revoked session until its short-lived token expires.
- Browser automation uses a controlled provider UI and signed test tokens; the Worker uses real cryptographic validation. A real Clerk smoke test is a separate rollout check, since it needs a configured application.
