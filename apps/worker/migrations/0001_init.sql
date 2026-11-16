-- Card Duel: persistent player data (ADR-0005).

-- Accounts: unique username ignoring case, password hash with its parameters.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,          -- lower-cased username, for case-insensitive uniqueness
  password_hash TEXT NOT NULL,                -- base64
  password_salt TEXT NOT NULL,                -- base64
  password_iterations INTEGER NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
  created_at INTEGER NOT NULL                 -- epoch milliseconds
);

-- Sessions back the HttpOnly session cookie. The id is a hash of the cookie token.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_account ON sessions(account_id);

-- Decks reference cards by id (ADR-0004) and may be incomplete (GLOSSARY.md: Deck).
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  faction TEXT NOT NULL CHECK (faction IN ('swarm', 'court')),
  leader TEXT,                                 -- card id, or NULL while unchosen
  cards TEXT NOT NULL DEFAULT '[]',            -- JSON array of card ids
  updated_at INTEGER NOT NULL
);
CREATE INDEX decks_by_account_faction ON decks(account_id, faction);

-- One row per finished Match. The Room deletes its own storage after 24 hours idle
-- (ADR-0002), so the seed and action log live here: this is ADR-0005's "pointer to the
-- action log". Void Matches write nothing.
CREATE TABLE match_results (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  player0_id TEXT NOT NULL REFERENCES accounts(id),
  player1_id TEXT NOT NULL REFERENCES accounts(id),
  faction0 TEXT NOT NULL,
  faction1 TEXT NOT NULL,
  deck0 TEXT NOT NULL,                         -- JSON Deck as played
  deck1 TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'draw')),
  winner_seat INTEGER CHECK (winner_seat IN (0, 1)),   -- NULL for a Draw
  ended_by TEXT NOT NULL CHECK (ended_by IN ('gems', 'forfeit', 'disconnect')),
  seed INTEGER NOT NULL,
  action_log TEXT NOT NULL,                    -- JSON array of { seat, action }
  finished_at INTEGER NOT NULL,
  CHECK ((outcome = 'draw') = (winner_seat IS NULL))
);
CREATE INDEX match_results_by_player0 ON match_results(player0_id, finished_at);
CREATE INDEX match_results_by_player1 ON match_results(player1_id, finished_at);

-- Each account's Record, updated from match_results.
CREATE TABLE records (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  disconnect_wins INTEGER NOT NULL DEFAULT 0,
  disconnect_losses INTEGER NOT NULL DEFAULT 0
);
