-- Card Catalog v2 adds the Kingdom, Vikings and Elves Factions. SQLite cannot change a CHECK
-- constraint in place, so the decks table is rebuilt with the wider one.
CREATE TABLE decks_v2 (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  faction TEXT NOT NULL CHECK (faction IN ('swarm', 'court', 'kingdom', 'vikings', 'elves')),
  leader TEXT,                                 -- card id, or NULL while unchosen
  cards TEXT NOT NULL DEFAULT '[]',            -- JSON array of card ids
  updated_at INTEGER NOT NULL
);
INSERT INTO decks_v2 (id, account_id, name, faction, leader, cards, updated_at)
  SELECT id, account_id, name, faction, leader, cards, updated_at FROM decks;
DROP TABLE decks;
ALTER TABLE decks_v2 RENAME TO decks;
CREATE INDEX clerk_decks_by_account_faction ON decks(account_id, faction);
