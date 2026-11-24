# Card Duel

An online two-player card game played over rounds on a three-row battlefield. Players build Decks from a Card Catalog and face each other in shared Rooms.

## Players

**Display name**:
A player's editable public name, shown in Rooms and account controls. Display names do not need to be unique. An immutable account ID owns Decks and Records; email and password belong to Clerk authentication.
_Avoid_: username (when referring to the public name)

**Recently Active Player**:
A signed-in player who has done anything in the game within the last few minutes, whether on Home, in the Decks, in a Queue or in a Room. Home shows signed-in players how many there are, the viewer included.
_Avoid_: online player, active user, concurrent user, presence

## Cards and decks

**Card Catalog**:
The authoritative, versioned set of every card that exists in the game, with its strength, row, abilities and faction.
_Avoid_: card database, card list

**Faction**:
One of the playable sides; every card in a Deck (except neutral cards) belongs to the Deck's Faction, and each Faction has a passive ability.

**Swarm**:
The Faction built around Muster; after each Round, one random non-Hero Unit Card of its player stays on the battlefield.

**Court**:
The Faction built around Spies and Medics; its player wins tied Rounds.

**Deck**:
A player-owned selection of cards for one Faction, complete or not. A player may keep several Decks per Faction.
_Avoid_: build, list

**Valid Deck**:
A Deck that meets the base limits: exactly one Leader, at least 22 Unit Cards, at most 10 Special Cards, no card beyond its copy limit, and only cards of its Faction or Neutral Cards. Only a Valid Deck can take a Seat.
_Avoid_: legal deck, complete deck

**Starter Deck**:
The predefined Deck offered for each Faction as a quick way to start. New players receive one copy per Faction and may copy more into their own Decks.
_Avoid_: base deck, default deck, pre-constructed deck

**Competitive Deck**:
A Valid Deck whose contents also meet the competitive limits: at most 5 Special Cards, at most 2 Medics, at most 2 Spies (Heroes included), and a total printed Strength of its Unit Cards (Heroes included, Side Deck excluded) of at most 130. A Deck is Competitive or not by what it contains; it is never declared.
_Avoid_: ranked deck, tournament deck

**Side Deck**:
Cards that never start in a Deck but can be brought onto the battlefield by Summon or Berserker abilities.

**Leader**:
The single card chosen before a match that grants a passive or once-per-match active ability.

**Unit Card**:
A card with a strength value that is placed on a combat row.

**Hero**:
A Unit Card immune to all card, special and leader abilities.

**Special Card**:
A card without strength whose ability affects the battlefield (weather, horn, decoy, scorch, etc.).

**Neutral Card**:
A card that belongs to no Faction and may be included in a Deck of any Faction.

**Spy**:
A Unit Card its player plays onto the opponent's side, where it counts for the opponent and belongs to them from then on; playing it draws its player two cards.

**Medic**:
A Unit Card whose on-play ability Plays a non-Hero Unit Card of its player's choice from their Discard Pile.

**Muster**:
An ability that, when its card is Played, also Plays every other card of the same Muster group from its player's hand and deck.

**Discard Pile**:
A player's face-up pile of cards that have left their side of the battlefield or been used from their hand.
_Avoid_: graveyard, cemetery

## Rooms and matches

**Room**:
A shareable place, identified by a short code, with exactly two Seats. A Room hosts one Match at a time and can host Rematches.
_Avoid_: lobby, table, game

**Seat**:
One of the two places in a Room; a player takes a Seat by committing a Valid Deck to the next Match. Neither player sees the other's Deck until both have taken a Seat.
_Avoid_: slot, spot

**Competitive Room**:
A Room in which only Competitive Decks may take a Seat.
_Avoid_: ranked room

**Matched Room**:
A Room the server creates by pairing two players from the matchmaking queue; its code is shown to no one else, and it always has a Turn Timer of the default length.
_Avoid_: public room, ranked room, queue room

**Queue**:
Where a signed-in player waits, with a Valid Deck chosen, to be paired with another player in a new Room. One Queue for Casual and one for Competitive.
_Avoid_: lobby, pool, search

**Rematch**:
A new Match between the same two players in the same Room, started when both accept.

**Match**:
One complete best-of-Gems contest between the two players in a Room, from coin flip to the last Gem lost or a Forfeit.
_Avoid_: game, session

**Forfeit**:
A player giving up the current Match at any time, which hands the win to the opponent. Counts as an ordinary loss and win.
_Avoid_: concede, surrender, resign

**Disconnect Win**:
A Match won because the opponent stayed disconnected past the grace period and the remaining player claimed it, or the Room expired with only that player present. The absent player takes a **Disconnect Loss**.
_Avoid_: abandon win, timeout win

**Void Match**:
A Match abandoned by both players; it has no result and leaves both Records unchanged.

**Record**:
A player's lifetime tally of wins, losses, draws, Disconnect Wins and Disconnect Losses.
_Avoid_: score, stats, rating

## Play

**Round**:
One phase of play in which players alternate Turns until both have Passed; the higher Score wins it.

**Turn**:
One player's single action within a Round: Play a card, use their Leader ability, or Pass.
_Avoid_: move

**Turn Timer**:
The time limit a player has to act whenever the Match is waiting on them: on their Turn, in Redraw or on a Pending Choice. It restarts after each of their actions, keeps running while they are disconnected, and applies in every Matched Room and in any other Room created with it. Its length is set when the Room is created and stays the same for every Match in that Room. When it runs out, the player does what doing nothing would do: on a Turn they Pass, in Redraw they keep their hand, and on a Pending Choice the first option is taken.
_Avoid_: clock, turn clock

**Tie**:
A Round that ends with equal Scores. Both players lose a Gem, unless exactly one of them has a Court Deck, in which case that player wins the Round.

**Draw**:
A Match that ends with both players losing their last Gem in the same Round.
_Avoid_: tie (a Tie is a Round result)

**Redraw**:
The private step at the start of a Match in which each player may return up to two cards from their opening hand, drawing a replacement for each.
_Avoid_: mulligan

**Play**:
To bring a card onto the battlefield so that its on-play ability fires: from the hand, by a Medic, or by Muster.
_Avoid_: cast, deploy

**Put**:
To place a card on the battlefield without firing its on-play ability, as with Swarm's kept unit; its ongoing abilities still apply.
_Avoid_: summon (reserved for the Summon ability)

**Controller**:
The player on whose side of the battlefield a card sits. A Spy's Controller is the opponent of the player who played it.
_Avoid_: owner

**Pending Choice**:
A decision a player must make after a play has resolved, such as which card a Medic Plays; the Match waits for it, and it cannot be cancelled.

**Play Preview**:
The predicted outcome of a candidate play, shown before the player commits it: changed Strengths, Row and total Scores, cards destroyed and cards drawn.
_Avoid_: simulation, what-if, hint

**Card Detail**:
The enlarged view of a single card with its full ability text.
_Avoid_: preview, zoom, tooltip

**Strength**:
The numeric power of a Unit Card on the battlefield, after all effects.
_Avoid_: power, value

**Score**:
A player's total Strength on the battlefield during a Round.
_Avoid_: using "score" for a player's Record

**Pass**:
A player's choice to sit out the rest of the current Round.

**Gem**:
A life counter; each player starts with two and loses one for each Round they lose or Tie. A player who loses their last Gem loses the Match, unless both lose their last Gem in the same Round, which is a Draw.
_Avoid_: life, crown

**Row**:
One of the three combat lines on each side of the battlefield: Close, Ranged and Siege.

**Weather**:
A Special Card that sets the strength of all non-Hero units on one or more Rows to 1 for both players while it is in play.
