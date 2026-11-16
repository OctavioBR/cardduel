# A Match is stored as a random seed plus an action log, replayed through a deterministic engine

The source of truth for a Match is its random seed and the ordered list of player actions. The current state is derived by replaying them through the rules engine, and a cached snapshot avoids replaying on every message. This gives replays, exact bug reproduction and simple tests (seed + actions → expected state) almost for free.

## Consequences

- The rules engine must be fully deterministic. All randomness (coin flip, shuffles, random picks from a discard pile or battlefield) comes from the seeded generator passed in, never from `Math.random()`, the clock or iteration order of unordered collections.
- Changing the meaning of an existing action or card breaks replay of old Matches, which is one reason Matches pin a Card Catalog version (ADR-0004).
