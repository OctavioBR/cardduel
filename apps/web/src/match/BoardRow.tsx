import type { RowId, RowView } from "@card-duel/engine";
import { Card } from "../cards/Card";
import { ROW_LABEL, RowIcon } from "../cards/icons";

export function BoardRow(props: {
  side: "you" | "opponent";
  row: RowId;
  view: RowView;
  leaderHorn: boolean;
  weathered: boolean;
  target?: boolean;
  onPick?: () => void;
}) {
  const label = `${props.side === "you" ? "Your" : "Opponent's"} ${ROW_LABEL[props.row]} Row, Score ${props.view.score}`;
  const content = (
    <>
      <section className="horn-slot" aria-label="Horn slot">
        {props.view.horn ? (
          <Card cardId={props.view.horn.cardId} size="token" />
        ) : props.leaderHorn ? (
          <span>Leader Horn</span>
        ) : null}
      </section>
      <div className="row-label">
        <RowIcon row={props.row} size={20} />
        <span className="row-score">{props.view.score}</span>
      </div>
      <div className="row-units">
        {props.view.units.map((unit) => (
          <Card key={unit.uid} cardId={unit.cardId} size="token" strength={unit.strength} />
        ))}
      </div>
    </>
  );
  const className = `board-row ${props.side}${props.weathered ? " weathered" : ""}${props.target ? " target" : ""}`;
  const testId = `row-${props.side}-${props.row}`;
  if (props.target) {
    return (
      <button
        type="button"
        className={className}
        aria-label={`Play to ${label}`}
        onClick={props.onPick}
        data-testid={testId}
      >
        {content}
      </button>
    );
  }
  return (
    <section className={className} aria-label={label} data-testid={testId}>
      {content}
    </section>
  );
}
