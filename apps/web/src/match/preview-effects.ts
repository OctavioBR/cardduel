import type { LegalAction, RowId, SeatView } from "@card-duel/engine";
import { ROWS } from "@card-duel/engine";

export interface Ghost {
  cardId: string;
  strength: number;
}

/** What to draw on the board for a Play Preview. */
export interface PreviewEffects {
  /** Units already on the battlefield whose Strength would change. */
  deltas: Map<number, { from: number; to: number }>;
  destroyed: Set<number>;
  returned: Set<number>;
  /** Cards that would arrive, keyed "you:close" etc. */
  ghosts: Map<string, Ghost[]>;
  rowDelta: { you: Record<RowId, number>; opponent: Record<RowId, number> };
  totalDelta: { you: number; opponent: number };
  drawn: number;
}

export function previewEffects(view: SeatView, action: LegalAction | null): PreviewEffects | null {
  const preview = action?.preview;
  if (!preview) return null;
  const deltas = new Map<number, { from: number; to: number }>();
  const ghosts = new Map<string, Ghost[]>();
  for (const unit of preview.units) {
    if (unit.from !== null && unit.uid !== undefined) {
      deltas.set(unit.uid, { from: unit.from, to: unit.to });
    } else {
      const key = `${unit.side}:${unit.row}`;
      ghosts.set(key, [...(ghosts.get(key) ?? []), { cardId: unit.cardId, strength: unit.to }]);
    }
  }
  const rowDelta = (side: "you" | "opponent") =>
    Object.fromEntries(
      ROWS.map((r) => [r, preview.rows[side][r] - view.board[side].rows[r].score]),
    ) as Record<RowId, number>;
  return {
    deltas,
    destroyed: new Set(preview.destroyed.map((c) => c.uid)),
    returned: new Set(preview.returned.map((c) => c.uid)),
    ghosts,
    rowDelta: { you: rowDelta("you"), opponent: rowDelta("opponent") },
    totalDelta: {
      you: preview.totals.you - view.board.you.score,
      opponent: preview.totals.opponent - view.board.opponent.score,
    },
    drawn: preview.drawn,
  };
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
