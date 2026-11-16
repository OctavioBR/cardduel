# The Card Catalog and Starter Decks are versioned data in the repo, and Matches copy and pin them

Card definitions (strength, Row, abilities, Faction, max copies per Deck, image) and the Starter Deck for each Faction live as data files in the repository and ship with each deploy. Card corrections are made by editing data and redeploying, not through an admin UI or database rows. Saved Decks reference cards by ID.

When a player takes a seat, the server checks the chosen Deck (one Leader, at least 22 Unit Cards, at most 10 Special Cards, one Faction, max copies per card) and copies it into the Match together with the current Card Catalog version. Later Deck edits or catalog fixes never affect a running Match, and an old Match still replays (ADR-0003).

## Consequences

- Old catalog versions referenced by stored Matches must stay loadable, or replays of those Matches are given up on purpose.
- A catalog change that removes or invalidates a card can make saved Decks invalid. They fail the check at seat time rather than being migrated silently.
- The Competitive Deck limits (Special Cards, Medics, Spies, total Unit Strength) are versioned data next to the Card Catalog, not constants in code. Tuning them is a data change, and a Match pins them along with the catalog version. The Deck builder only warns about them, and the server enforces them at seat time only in a Competitive Room.
