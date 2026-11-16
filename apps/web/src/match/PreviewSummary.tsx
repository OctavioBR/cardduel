import type { PlayPreview, SeatView } from "@card-duel/engine";

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
    `You ${view.board.you.score} → ${preview.totals.you}${you ? ` (${you > 0 ? "+" : ""}${you})` : ""}`,
  );
  parts.push(
    `Opponent ${view.board.opponent.score} → ${preview.totals.opponent}${opp ? ` (${opp > 0 ? "+" : ""}${opp})` : ""}`,
  );
  if (preview.destroyed.length) parts.push(`destroys ${preview.destroyed.length}`);
  if (preview.drawn) parts.push(`+${preview.drawn} card${preview.drawn === 1 ? "" : "s"}`);
  return (
    <span className="preview-summary" data-testid="preview-summary">
      {parts.join(" · ")}
    </span>
  );
}
