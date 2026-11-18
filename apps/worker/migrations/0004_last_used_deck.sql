-- The Deck an account most recently committed to a Seat (from the Queue or a Room), which
-- Home selects by default (#108). No foreign key: a deleted Deck simply stops matching.
ALTER TABLE accounts ADD COLUMN last_deck_id TEXT;
