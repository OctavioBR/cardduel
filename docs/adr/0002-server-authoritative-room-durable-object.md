# Each Room is a server-authoritative Durable Object speaking WebSocket with hibernation

Players hold hidden information (hand, deck order) and the deck is shuffled at random, so clients cannot be trusted with the full state. Each Room is one Durable Object, addressed by its short shareable code. It owns the Match state and runs the rules engine. Clients send only actions (play a card, Pass, Forfeit, …). After each accepted action the Room pushes each player their own complete filtered view, together with the events that action produced (card played, unit destroyed, Strength changed, Round ended, …), filtered the same way: an opponent's draw becomes "opponent drew a card". The view of the player to move also lists their legal actions and a Play Preview for each one, all computed on the server, so the client never runs the rules. Events exist only so the client can animate the change. The view is the truth.

The connection is a WebSocket accepted through the Durable Object Hibernation API. Each action carries the action number the client last saw, and the Room rejects actions based on an outdated state. Sending full views (a few KB) instead of changes means reconnects and missed messages need no special handling: a reconnecting client receives just the view, without events.

## Considered Options

- **Client-authoritative / peer state passing**: rejected. Either player could read the opponent's hand or forge draws.
- **Server-Sent Events plus HTTP POST for actions**: rejected. An open SSE response keeps the Durable Object in memory, billed for the whole Match, while hibernation evicts it between moves and keeps sockets open. Every POST is a full billed request, whereas incoming WebSocket messages count at 20:1. SSE would also split one conversation across two channels.
- **Client computes Play Previews with the shared engine**: rejected. The client's view hides cards (the opponent's hand, deck order), so the engine would need a partial-information mode and could disagree with the server about what a play does.
- **Views only, with the client diffing them to animate**: rejected. Scorch, Weather and Decoy can all look like "a card vanished"; only the engine knows which happened.

## Consequences

- Disconnect handling (2-minute grace, claimable Disconnect Win, automatic award or Void Match when the Room expires) runs on Durable Object alarms. The Room deletes its own storage after 24h idle.
- Each pushed view costs one engine run per legal action (a few dozen) to build its Play Previews. That must stay inside the Free plan CPU budget (ADR-0001).
- A Room has exactly two Seats. 2v2, free-for-all and AI opponents are out of scope until designed.
