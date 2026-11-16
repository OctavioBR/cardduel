# D1 stores accounts, Decks, Match results and Records, with no email and in-house auth

Persistent player data lives in D1: accounts, sessions, Decks (a player may keep several per Faction) and one result row per finished Match (players, Factions, Decks, outcome, how it ended, pointer to the action log). Each account's Record (wins, losses, draws, Disconnect Wins, Disconnect Losses) is updated from those rows. Forfeits count as ordinary losses and wins, and Void Matches write nothing. There is no numeric rating in v1.

Authentication is written in-house rather than through a hosted provider such as Clerk or Auth0, which would add an outside dependency. Login is by unique username and password, hashed with WebCrypto PBKDF2 inside the Worker, with an HttpOnly session cookie backed by a D1 sessions table. No email is collected, so there is no password reset or email delivery to run or pay for. Google sign-in is planned as a second way into the same account, and it doubles as the recovery path.

## Considered Options

- **KV**: rejected. Decks and Records are relational and need queries like "my Decks for this Faction".
- **One Durable Object per user**: rejected. It makes cross-user queries (future leaderboards, match history) awkward.

## Consequences

- PBKDF2 iterations are capped at 100k by the Workers runtime and must also fit the Free plan's CPU budget (ADR-0001). The iteration count is a tunable that is expected to rise when moving to Workers Paid, so stored hashes must record their parameters.
- A user who forgets their password and has not linked Google loses the account.
