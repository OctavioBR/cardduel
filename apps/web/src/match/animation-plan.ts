import type { MatchEvent, Seat } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import copy from "../strings/en.json";

/** One visual step of the queue; steps play one after another. */
export type AnimationStep =
  | { kind: "enter"; uids: number[]; from: "yourHand" | "opponentHand" | "deck" | "none" }
  | { kind: "leave"; uids: number[]; style: "destroyed" | "discarded" }
  | { kind: "strength"; changes: { uid: number; up: boolean }[] }
  | { kind: "weather" }
  | { kind: "drawn"; uids: number[]; seat: "you" | "opponent" }
  | { kind: "move"; uids: number[] }
  | { kind: "round"; text: string };

/** Duration of one step, inside the issue's 250 to 400 ms. */
export const STEP_MS = 320;

/**
 * Turns a batch of filtered events into animation steps (#38). Events exist only so the
 * client can show what happened; the view stays the truth (ADR-0002).
 */
export function planAnimations(events: readonly MatchEvent[], seat: Seat): AnimationStep[] {
  const steps: AnimationStep[] = [];
  const mine = (s: Seat) => s === seat;
  for (const e of events) {
    switch (e.type) {
      case "cardPlayed":
        steps.push({
          kind: "enter",
          uids: [e.card.uid],
          from:
            e.via === "muster" || e.via === "leader"
              ? "deck"
              : e.via === "medic" || e.via === "summon"
                ? "none"
                : mine(e.seat)
                  ? "yourHand"
                  : "opponentHand",
        });
        if (e.zone === "weather") steps.push({ kind: "weather" });
        break;
      case "weatherCleared":
        steps.push(
          { kind: "leave", uids: e.cards.map((c) => c.uid), style: "discarded" },
          { kind: "weather" },
        );
        break;
      case "destroyed":
        steps.push({ kind: "leave", uids: e.cards.map((c) => c.uid), style: "destroyed" });
        break;
      case "transformed":
        // Frenzy: each Berserker leaves, then its Side Deck form appears in its place.
        steps.push(
          { kind: "leave", uids: e.changes.map((c) => c.from.uid), style: "discarded" },
          { kind: "enter", uids: e.changes.map((c) => c.to.uid), from: "none" },
        );
        break;
      case "strengthChanged":
        steps.push({
          kind: "strength",
          changes: e.changes.map((c) => ({ uid: c.uid, up: c.to > c.from })),
        });
        break;
      case "returnedToHand":
        steps.push({ kind: "move", uids: [e.card.uid] });
        break;
      case "unitsMoved":
        steps.push({ kind: "move", uids: e.moves.map((m) => m.card.uid) });
        break;
      case "drew":
        steps.push({
          kind: "drawn",
          uids: e.cards?.map((c) => c.uid) ?? [],
          seat: mine(e.seat) ? "you" : "opponent",
        });
        break;
      case "roundEnded": {
        const text =
          e.winner === null
            ? formatCopy(copy.roundTie, { p0: e.round })
            : mine(e.winner)
              ? formatCopy(copy.roundYouWin, { p0: e.round })
              : formatCopy(copy.roundOpponentWins, { p0: e.round });
        steps.push({ kind: "round", text });
        break;
      }
      case "factionPassive":
        if (e.faction === "vikings") {
          steps.push({ kind: "enter", uids: e.cards.map((c) => c.uid), from: "none" });
        }
        break;
      case "cardsDiscarded":
        steps.push({ kind: "leave", uids: e.cards.map((c) => c.uid), style: "discarded" });
        break;
      default:
        break;
    }
  }
  return steps;
}
