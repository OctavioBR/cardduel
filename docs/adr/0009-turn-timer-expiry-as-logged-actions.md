# The Room acts for a player whose Turn Timer runs out, through the action log

When the Turn Timer runs out, the Room's alarm submits the action the player would have taken by doing nothing: a Pass on a Turn, confirming Redraw with the cards returned so far, or the first listed option of a Pending Choice. These go through `applyAction` like a player's action and are logged as that Seat's action, marked `timedOut` on the log entry. The engine never reads the clock (ADR-0003); only the Room knows about time. Replay rebuilds the Match from the log without knowing anything about timers.

## Considered Options

- **Store expiry outside the log, like a Disconnect Win's `externalResult`**: rejected. A Disconnect Win ends the Match, so nothing is replayed after it. After an expiry the Match goes on, so replay has to see it.
- **Give the engine a clock or deadline input**: rejected. The engine would no longer be deterministic, and every test and replay would need a clock.
- **End the Match on expiry**: rejected. It needs a new result reason and Record rules. Automatic Passes already end a stalled Match through Gems in a few minutes.

## Consequences

- Events distinguish why a Pass happened (the player Passed, they had nothing they could do, or the Turn Timer ran out), so the opponent sees "Time ran out" instead of a plain Pass.
- The Room schedules one alarm for the earliest deadline it holds: Turn Timer, disconnect grace or idle expiry.
- The Turn Timer keeps running while the player who must act is disconnected. Otherwise disconnecting and reconnecting would reset the grace and allow endless stalling.
