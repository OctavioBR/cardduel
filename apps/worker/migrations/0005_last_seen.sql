-- When each account was last active, to count Recently Active Players on Home (#119).
-- Written at most once a minute per account; the index keeps the count to the recent rows.
ALTER TABLE accounts ADD COLUMN last_seen INTEGER;
CREATE INDEX accounts_last_seen ON accounts (last_seen);
