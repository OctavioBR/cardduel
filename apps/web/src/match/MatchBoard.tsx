import type { Action, CardRef, RowId, SeatView, UnitView } from "@card-duel/engine";
import { ROWS } from "@card-duel/engine";
import { useEffect, useState } from "react";
import { cardDef, cardName } from "../cards/strings";

const ROW_LABEL: Record<RowId, string> = { close: "Close", ranged: "Ranged", siege: "Siege" };

export interface MatchBoardProps {
  view: SeatView;
  send: (action: Action) => void;
  error?: string | null;
}

/** Legal play actions for one hand card, keyed by Row. Uses only the view (ADR-0002). */
export function playsFor(view: SeatView, uid: number): Map<RowId, Action> {
  const plays = new Map<RowId, Action>();
  for (const action of view.legalActions) {
    if (action.type === "play" && action.card === uid) plays.set(action.row, action);
  }
  return plays;
}

export function MatchBoard({ view, send, error }: MatchBoardProps) {
  // A selection belongs to one view: a new view (new action count) clears it.
  const [selection, setSelection] = useState<{ uid: number; at: number } | null>(null);
  const selected = selection?.at === view.actionCount ? selection.uid : null;
  const setSelected = (uid: number | null) =>
    setSelection(uid === null ? null : { uid, at: view.actionCount });
  const plays = selected === null ? new Map<RowId, Action>() : playsFor(view, selected);
  const canPass = view.legalActions.some((a) => a.type === "pass");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const playTo = (row: RowId) => {
    const action = plays.get(row);
    if (!action) return;
    setSelected(null);
    send(action);
  };

  return (
    <div className="board">
      <aside className="side-panel">
        <PlayerPanel
          who="Opponent"
          gems={view.opponent.gems}
          score={view.board.opponent.score}
          passed={view.opponent.passed}
          handSize={view.opponent.handSize}
          deckSize={view.opponent.deckSize}
          active={view.turn === "opponent"}
        />
        <div className="round-info">
          <div>Round {view.round}</div>
          <TurnLabel view={view} />
          {error ? (
            <div className="error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <PlayerPanel
          who="You"
          gems={view.you.gems}
          score={view.board.you.score}
          passed={view.you.passed}
          handSize={view.you.hand.length}
          deckSize={view.you.deckSize}
          active={view.turn === "you"}
        />
        <button
          type="button"
          className="pass-button"
          disabled={!canPass}
          onClick={() => send({ type: "pass" })}
        >
          Pass
        </button>
      </aside>

      <section className="battlefield" aria-label="Battlefield">
        {[...ROWS].reverse().map((row) => (
          <BoardRow
            key={`o-${row}`}
            side="opponent"
            row={row}
            units={view.board.opponent.rows[row].units}
            score={view.board.opponent.rows[row].score}
          />
        ))}
        <div className="divider" />
        {ROWS.map((row) => (
          <BoardRow
            key={`y-${row}`}
            side="you"
            row={row}
            units={view.board.you.rows[row].units}
            score={view.board.you.rows[row].score}
            target={plays.has(row)}
            onPick={() => playTo(row)}
          />
        ))}
      </section>

      <section className="hand" aria-label="Your hand">
        {view.you.hand.map((card) => (
          <HandCard
            key={card.uid}
            card={card}
            selected={selected === card.uid}
            playable={playsFor(view, card.uid).size > 0}
            onSelect={() => setSelected(selected === card.uid ? null : card.uid)}
          />
        ))}
      </section>

      {view.phase === "ended" && view.result ? <ResultBanner view={view} /> : null}
    </div>
  );
}

function TurnLabel({ view }: { view: SeatView }) {
  if (view.phase === "ended") return <div className="turn">Match over</div>;
  return (
    <div className="turn" data-testid="turn">
      {view.turn === "you" ? "Your Turn" : "Opponent's Turn"}
    </div>
  );
}

function PlayerPanel(props: {
  who: string;
  gems: number;
  score: number;
  passed: boolean;
  handSize: number;
  deckSize: number;
  active: boolean;
}) {
  return (
    <div
      className={`player-panel${props.active ? " active" : ""}`}
      data-testid={`panel-${props.who.toLowerCase()}`}
    >
      <div className="player-name">{props.who}</div>
      <div className="gems" role="img" aria-label={`${props.gems} Gems`}>
        {[0, 1].map((i) => (
          <span key={i} className={i < props.gems ? "gem" : "gem lost"} />
        ))}
      </div>
      <div className="total-score" data-testid={`score-${props.who.toLowerCase()}`}>
        {props.score}
      </div>
      <div className="counts">
        Hand {props.handSize} · Deck {props.deckSize}
      </div>
      {props.passed ? <div className="passed">Passed</div> : null}
    </div>
  );
}

function BoardRow(props: {
  side: "you" | "opponent";
  row: RowId;
  units: UnitView[];
  score: number;
  target?: boolean;
  onPick?: () => void;
}) {
  const label = `${props.side === "you" ? "Your" : "Opponent's"} ${ROW_LABEL[props.row]} Row`;
  const content = (
    <>
      <div className="row-label">
        <span>{ROW_LABEL[props.row]}</span>
        <span className="row-score">{props.score}</span>
      </div>
      <div className="row-units">
        {props.units.map((unit) => (
          <div key={unit.uid} className="unit-token" title={cardName(unit.cardId)}>
            <span className="unit-strength">{unit.strength}</span>
            <span className="unit-name">{cardName(unit.cardId)}</span>
          </div>
        ))}
      </div>
    </>
  );
  if (props.target) {
    return (
      <button
        type="button"
        className="board-row target"
        aria-label={`Play to ${label}`}
        onClick={props.onPick}
        data-testid={`row-${props.side}-${props.row}`}
      >
        {content}
      </button>
    );
  }
  return (
    <section
      className="board-row"
      aria-label={label}
      data-testid={`row-${props.side}-${props.row}`}
    >
      {content}
    </section>
  );
}

function HandCard(props: {
  card: CardRef;
  selected: boolean;
  playable: boolean;
  onSelect: () => void;
}) {
  const def = cardDef(props.card.cardId);
  return (
    <button
      type="button"
      className={`hand-card${props.selected ? " selected" : ""}`}
      disabled={!props.playable}
      aria-pressed={props.selected}
      onClick={props.onSelect}
      data-testid="hand-card"
    >
      <span className="hand-card-strength">{def?.kind === "unit" ? def.strength : ""}</span>
      <span className="hand-card-name">{cardName(props.card.cardId)}</span>
      <span className="hand-card-row">{def?.kind === "unit" ? ROW_LABEL[def.row] : ""}</span>
    </button>
  );
}

function ResultBanner({ view }: { view: SeatView }) {
  const result = view.result;
  if (!result) return null;
  const text =
    result.outcome === "draw"
      ? "Draw"
      : result.winner === view.seat
        ? "You won the Match"
        : "You lost the Match";
  return (
    <div className="result-banner" role="status" data-testid="result">
      {text}
    </div>
  );
}
