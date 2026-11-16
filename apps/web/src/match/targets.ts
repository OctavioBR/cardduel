import type { LegalAction, RowId, SeatView } from "@card-duel/engine";
import { cardDef } from "../cards/strings";

/** Where a selected hand card can go (from the view's legal actions only, ADR-0002). */
export type Target =
  | { kind: "row"; side: "you" | "opponent"; row: RowId; key: string; action: LegalAction }
  | { kind: "horn"; row: RowId; key: string; action: LegalAction }
  | { kind: "unit"; uid: number; key: string; action: LegalAction }
  | { kind: "battlefield"; key: string; action: LegalAction };

/** Every legal target for a hand card, in a stable order for keyboard cycling. */
export function targetsFor(view: SeatView, uid: number): Target[] {
  const targets: Target[] = [];
  for (const action of view.legalActions) {
    if (action.type !== "play" || action.card !== uid) continue;
    const def = cardDef(view.you.hand.find((c) => c.uid === uid)?.cardId ?? "");
    if (action.target !== undefined) {
      targets.push({ kind: "unit", uid: action.target, key: `unit:${action.target}`, action });
    } else if (action.row && def?.kind === "special") {
      targets.push({ kind: "horn", row: action.row, key: `horn:${action.row}`, action });
    } else if (action.row) {
      const spy = def?.kind === "unit" && def.abilities.includes("spy");
      const side = spy ? "opponent" : "you";
      targets.push({
        kind: "row",
        side,
        row: action.row,
        key: `row:${side}:${action.row}`,
        action,
      });
    } else {
      targets.push({ kind: "battlefield", key: "battlefield", action });
    }
  }
  return targets;
}

/** Hand cards that have at least one legal target. */
export function playableCards(view: SeatView): Set<number> {
  const uids = new Set<number>();
  for (const a of view.legalActions) if (a.type === "play") uids.add(a.card);
  return uids;
}
