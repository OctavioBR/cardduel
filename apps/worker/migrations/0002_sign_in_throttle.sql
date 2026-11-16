-- Failed sign-in counting per username (lower-cased), for throttling repeated attempts.
CREATE TABLE sign_in_failures (
  username_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL          -- epoch milliseconds of the first failure in the window
);
