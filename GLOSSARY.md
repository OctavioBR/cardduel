# Card Duel

An online two-player card game played over rounds on a three-row battlefield. Players build Decks from a Card Catalog and face each other in shared Rooms.

## Cards and decks

**Card Catalog**:
The authoritative, versioned set of every card that exists in the game, with its strength, row, abilities and faction.
_Avoid_: card database, card list

**Faction**:
One of the playable sides; every card in a Deck (except neutral cards) belongs to the Deck's Faction, and each Faction has a passive ability.

**Deck**:
A player-owned selection of cards for one Faction: exactly one Leader, at least 22 Unit Cards and at most 10 Special Cards. A player may keep several Decks per Faction.
_Avoid_: build, list

**Starter Deck**:
The predefined Deck offered for each Faction as a quick way to start; a player copies it into their own Decks.
_Avoid_: base deck, default deck, pre-constructed deck

**Competitive Deck**:
A Deck whose contents also meet the competitive limits: at most 5 Special Cards, at most 2 Medics, at most 2 Spies (Heroes included), and a total printed Strength of its Unit Cards (Heroes included, Side Deck excluded) of at most 130. A Deck is Competitive or not by what it contains; it is never declared.
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

## Rooms and matches

**Room**:
A shareable place, identified by a short code, where exactly two players sit down to play. A Room hosts one Match at a time and can host rematches.
_Avoid_: lobby, table, game

**Competitive Room**:
A Room in which only Competitive Decks may take a seat.
_Avoid_: ranked room

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
One phase of play in which players alternate placing cards until both have Passed; the higher total strength wins it.

**Strength**:
The numeric power of a Unit Card on the battlefield, after all effects.
_Avoid_: power, value

**Score**:
A player's total Strength on the battlefield during a Round.
_Avoid_: using "score" for a player's Record

**Pass**:
A player's choice to sit out the rest of the current Round.

**Gem**:
A life counter; each player starts with two and loses one per lost Round. Losing the last Gem loses the match.
_Avoid_: life, crown

**Row**:
One of the three combat lines on each side of the battlefield: Close, Ranged and Siege.

**Weather**:
A Special Card that sets the strength of all non-Hero units on one or more Rows to 1 for both players while it is in play.
