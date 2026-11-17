import type { PlayPreview, SeatView } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import copy from "../strings/en.json";

/** One-line Play Preview: Score changes, cards destroyed and cards drawn. */
export function PreviewSummary({
  view,
  preview,
}: {
  view: SeatView;
  preview: PlayPreview | undefined;
}) {
  if (!preview) return null;
  const you = preview.totals.you - view.board.you.score;
  const opp = preview.totals.opponent - view.board.opponent.score;
  const parts: string[] = [];
  parts.push(
    formatCopy(copy.you4, {
      p0: view.board.you.score,
      p1: preview.totals.you,
      p2: you ? ` (${you > 0 ? "+" : ""}${you})` : "",
    }),
  );
  parts.push(
    formatCopy(copy.opponent4, {
      p0: view.board.opponent.score,
      p1: preview.totals.opponent,
      p2: opp ? ` (${opp > 0 ? "+" : ""}${opp})` : "",
    }),
  );
  if (preview.destroyed.length)
    parts.push(formatCopy(copy.destroys, { p0: preview.destroyed.length }));
  if (preview.drawn)
    parts.push(
      formatCopy(preview.drawn === 1 ? copy.drawOneCard : copy.drawCards, { count: preview.drawn }),
    );
  return (
    <span
      className="preview-summary"
      data-testid="preview-summary"
      role="status"
      aria-live="polite"
    >
      {parts.join(" · ")}
    </span>
  );
}
