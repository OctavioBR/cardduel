# Launch on the Workers Free plan with 20k PBKDF2 iterations

The launch check (#57) measured production CPU time per request. At 50k PBKDF2 iterations, sign-in used 19-21 ms of CPU and sign-up 15-19 ms: about four times the laptop measurement that picked 50k, and double the Free plan's 10 ms limit. No request failed, but Cloudflare only tolerates an isolate that goes over the limit now and then. One that goes over on every request gets terminated with error 1102. We stay on the Free plan for launch and lower the count to 20k, about 8 ms, which fits. On their next successful sign-in, accounts hashed at another count are re-hashed at the current count.

## Considered Options

- **Move to Workers Paid ($5/month) and keep 50k**: rejected for now. It keeps hosting cost above zero (ADR-0001) before the game has players. It stays the way out if CPU limits start failing requests.
- **Keep 50k on the Free plan**: rejected. It depends on Cloudflare continuing to tolerate requests that go over the limit, and that tolerance runs out under steady traffic.

## Consequences

- 20k is far below current guidance for PBKDF2-SHA256 (OWASP recommends 600k), so a leaked accounts table is cheaper to crack. Online guessing is still held back by the sign-in throttle (5 failures per username per 15 minutes), and no email is stored.
- Moving to Workers Paid should raise the count again, up to the runtime's 100k cap. Re-hashing on sign-in moves existing accounts over without a migration.
- An account still at another count pays for both counts once, on its first sign-in after the change (about 28 ms going from 50k). This happens rarely enough to stay within Cloudflare's tolerance.
- Room WebSocket messages measured 3 ms median but up to 12-13 ms at P99. That is the next thing to watch on the Free plan, and it is not affected by this decision.
