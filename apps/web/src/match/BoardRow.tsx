import type { RowId, RowView } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Card } from "../cards/Card";
import { ROW_LABEL, RowIcon } from "../cards/icons";
import { cardName } from "../cards/strings";
import copy from "../strings/en.json";
import { type PreviewEffects, signed } from "./preview-effects";
import type { Target } from "./targets";

export interface TargetHandlers {
  /** Activate a target: play it, or (first touch tap with several targets) preview it. */
  onActivate: (target: Target) => void;
  /** Hover in or out (mouse and pen only). */
  onHover: (target: Target | null) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  disabled: boolean;
}

export function BoardRow(props: {
  side: "you" | "opponent";
  row: RowId;
  view: RowView;
  weathered: boolean;
  rowTarget?: Target | undefined;
  hornTarget?: Target | undefined;
  unitTargets: Map<number, Target>;
  previewKey: string | null;
  effects: PreviewEffects | null;
  handlers: TargetHandlers;
}) {
  const { handlers, effects } = props;
  const label = formatCopy(copy.rowScore, {
    p0: props.side === "you" ? copy.your : copy.opponentS,
    p1: ROW_LABEL[props.row],
    p2: props.view.score,
  });
  const rowDelta = effects?.rowDelta[props.side][props.row] ?? 0;
  const ghosts = effects?.ghosts.get(`${props.side}:${props.row}`) ?? [];
  const targetProps = (target: Target) => ({
    onClick: () => handlers.onActivate(target),
    onPointerDown: handlers.onPointerDown,
    onPointerEnter: (e: ReactPointerEvent) => {
      if (e.pointerType !== "touch") handlers.onHover(target);
    },
    onPointerLeave: (e: ReactPointerEvent) => {
      if (e.pointerType !== "touch") handlers.onHover(null);
    },
    disabled: handlers.disabled,
    "data-target-key": target.key,
    "data-previewing": props.previewKey === target.key ? "true" : undefined,
  });

  const horn = (
    <>
      {props.view.horn ? (
        <span data-anim-uid={props.view.horn.uid}>
          <Card cardId={props.view.horn.cardId} size="token" />
        </span>
      ) : null}
      {!props.view.horn && props.view.leaderHorn ? <span>{copy.leaderHorn}</span> : null}
    </>
  );
  const content = (
    <>
      {props.hornTarget ? (
        <button
          type="button"
          className="horn-slot target"
          aria-label={formatCopy(copy.playToTheHornSlotOf, { p0: label })}
          {...targetProps(props.hornTarget)}
        >
          {horn}
        </button>
      ) : (
        <section className="horn-slot" aria-label={copy.hornSlot}>
          {horn}
        </section>
      )}
      <div className="row-label">
        <RowIcon row={props.row} size={20} />
        <span className="row-score">{props.view.score}</span>
        {rowDelta !== 0 ? (
          <span
            className={`delta ${rowDelta > 0 ? "up" : "down"}`}
            data-testid={`row-delta-${props.side}-${props.row}`}
          >
            {signed(rowDelta)}
          </span>
        ) : null}
      </div>
      <div className="row-units">
        {props.view.units.map((unit) => {
          const delta = effects?.deltas.get(unit.uid);
          const doomed = effects?.destroyed.has(unit.uid) ?? false;
          const returned = effects?.returned.has(unit.uid) ?? false;
          const token = (
            <>
              <Card
                cardId={unit.cardId}
                artIndex={unit.artIndex}
                size="token"
                strength={delta ? delta.to : unit.strength}
              />
              {delta ? (
                <span className={`delta badge ${delta.to > delta.from ? "up" : "down"}`}>
                  {signed(delta.to - delta.from)}
                </span>
              ) : null}
              {returned ? <span className="delta badge">{copy.toHand}</span> : null}
            </>
          );
          const unitTarget = props.unitTargets.get(unit.uid);
          const cls = `unit${doomed ? " doomed" : ""}${delta ? " changed" : ""}`;
          return unitTarget ? (
            <button
              key={unit.uid}
              type="button"
              className={`${cls} target`}
              aria-label={formatCopy(copy.target, { p0: cardName(unit.cardId) })}
              data-uid={unit.uid}
              data-anim-uid={unit.uid}
              data-doomed={doomed ? "true" : undefined}
              {...targetProps(unitTarget)}
            >
              {token}
            </button>
          ) : (
            <div
              key={unit.uid}
              className={cls}
              tabIndex={props.rowTarget ? undefined : 0}
              data-uid={unit.uid}
              data-anim-uid={unit.uid}
              data-doomed={doomed ? "true" : undefined}
            >
              {token}
            </div>
          );
        })}
        {ghosts.map((g, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: ghosts are identical copies with no identity; their order is stable within a preview
          <div key={`ghost-${g.cardId}-${i}`} className="unit ghost" data-testid="ghost">
            <Card cardId={g.cardId} size="token" strength={g.strength} />
          </div>
        ))}
      </div>
    </>
  );
  const className = `board-row ${props.side}${props.weathered ? " weathered" : ""}${props.rowTarget ? " target" : ""}`;
  const testId = `row-${props.side}-${props.row}`;
  if (props.rowTarget) {
    return (
      <button
        type="button"
        className={className}
        aria-label={formatCopy(copy.playTo, { p0: label })}
        data-testid={testId}
        {...targetProps(props.rowTarget)}
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
