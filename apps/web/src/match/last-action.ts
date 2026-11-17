import type { MatchEvent, Seat, SeatView } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { cardName } from "../cards/strings";
import copy from "../strings/en.json";

/**
 * The Turn a batch of events records, as one line from the Seat's point of view: a card
 * Played, a Leader ability used or a Pass. Null when the batch holds none (a Redraw, say),
 * so the board keeps showing the previous one.
 */
export function lastActionText(
  events: readonly MatchEvent[],
  seat: Seat,
  view: Pick<SeatView, "you" | "opponent">,
): string | null {
  for (const e of events) {
    // Cards a Leader ability Plays follow its leaderUsed event, which names the action.
    if (e.type === "cardPlayed" && e.via !== "leader") {
      const mine = e.seat === seat;
      return formatCopy(mine ? copy.lastActionYouPlayed : copy.lastActionOpponentPlayed, {
        card: cardName(e.card.cardId),
      });
    }
    if (e.type === "leaderUsed") {
      const mine = e.seat === seat;
      const leader = (mine ? view.you : view.opponent).leader.cardId;
      return formatCopy(mine ? copy.lastActionYouUsedLeader : copy.lastActionOpponentUsedLeader, {
        leader: cardName(leader),
      });
    }
    if (e.type === "passed")
      return e.seat === seat ? copy.lastActionYouPassed : copy.lastActionOpponentPassed;
  }
  return null;
}
