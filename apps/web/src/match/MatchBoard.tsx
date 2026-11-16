import type { Action, RowId, SeatView } from "@card-duel/engine";
import { ROWS } from "@card-duel/engine";
import { useEffect, useState } from "react";
import { Card } from "../cards/Card";
import { cardDef, cardName } from "../cards/strings";
import { BoardRow } from "./BoardRow";
import { Piles } from "./Piles";
import { PlayerPanel } from "./PlayerPanel";

export interface MatchBoardProps {
  view: SeatView;
  send: (action: Action) => void;
  error?: string | null;
}

/** Legal play actions for one hand card, keyed by Row. Uses only the view (ADR-0002). */
export function playsFor(view: SeatView, uid: number): Map<RowId, Action> {
  const plays = new Map<RowId, Action>();
  for (const action of view.legalActions) {
    // Row-less plays (Weather, Scorch) and Decoy targets arrive with tap-to-play (#35).
    if (action.type === "play" && action.card === uid && action.row) plays.set(action.row, action);
  }
  return plays;
}

/** Rows covered by the Weather cards in the view. */
export function weatheredRows(view: SeatView): Set<RowId> {
  const rows = new Set<RowId>();
  for (const w of view.weather) {
    const def = cardDef(w.cardId);
    if (def?.kind === "special" && def.effect.type === "weather")
      for (const r of def.effect.rows) rows.add(r);
  }
  return rows;
}

/** The full Match stage (ADR-0006): every piece of the view is shown somewhere. */
export function MatchBoard({ view, send, error }: MatchBoardProps) {
  // A selection belongs to one view: a new view (new action count) clears it.
  const [selection, setSelection] = useState<{ uid: number; at: number } | null>(null);
  const selected = selection?.at === view.actionCount ? selection.uid : null;
  const setSelected = (uid: number | null) =>
    setSelection(uid === null ? null : { uid, at: view.actionCount });
  const plays = selected === null ? new Map<RowId, Action>() : playsFor(view, selected);
  const canPass = view.legalActions.some((a) => a.type === "pass");
  const weathered = weatheredRows(view);
  const seen = new Set(view.you.seenByOpponent);

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
    <div className="board" data-testid="board" data-action-count={view.actionCount}>
      <aside className="side">
        <PlayerPanel
          who="opponent"
          faction={view.opponent.faction}
          leader={view.opponent.leader}
          gems={view.opponent.gems}
          score={view.board.opponent.score}
          passed={view.opponent.passed}
          handSize={view.opponent.handSize}
          active={view.turn === "opponent"}
          knownHand={view.opponent.knownHand}
        />
        <div className="round-info">
          <section className="weather-zone" aria-label="Weather">
            {view.weather.length === 0 ? <span className="empty">No Weather</span> : null}
            {view.weather.map((w) => (
              <Card key={w.uid} cardId={w.cardId} size="token" />
            ))}
          </section>
          <div>Round {view.round}</div>
          <TurnLabel view={view} />
          {view.opponentChoosing ? <div className="notice">Your opponent is choosing…</div> : null}
          {view.phase === "redraw" ? (
            <div>
              Opponent returned {view.opponent.redraw.returned} card
              {view.opponent.redraw.returned === 1 ? "" : "s"}
            </div>
          ) : null}
          {error ? (
            <div className="error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <PlayerPanel
          who="you"
          faction={view.you.faction}
          leader={view.you.leader}
          gems={view.you.gems}
          score={view.board.you.score}
          passed={view.you.passed}
          handSize={view.you.hand.length}
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

      <section className="field" aria-label="Battlefield">
        {[...ROWS].reverse().map((row) => (
          <BoardRow
            key={`o-${row}`}
            side="opponent"
            row={row}
            view={view.board.opponent.rows[row]}
            leaderHorn={view.board.opponent.rows[row].leaderHorn}
            weathered={weathered.has(row)}
          />
        ))}
        <div className="divider" />
        {ROWS.map((row) => (
          <BoardRow
            key={`y-${row}`}
            side="you"
            row={row}
            view={view.board.you.rows[row]}
            leaderHorn={view.board.you.rows[row].leaderHorn}
            weathered={weathered.has(row)}
            target={plays.has(row)}
            onPick={() => playTo(row)}
          />
        ))}
      </section>

      <Piles
        yourFaction={view.you.faction}
        opponentFaction={view.opponent.faction}
        yourDeck={view.you.deck}
        yourDeckSize={view.you.deckSize}
        yourDiscard={view.you.discard}
        opponentDeckSize={view.opponent.deckSize}
        opponentDiscard={view.opponent.discard}
      />

      <section className="hand" aria-label="Your hand">
        {view.you.hand.map((card) => {
          const redraw = view.phase === "redraw";
          const playable = redraw
            ? view.legalActions.some((a) => a.type === "redraw" && a.card === card.uid)
            : playsFor(view, card.uid).size > 0;
          return (
            <button
              key={card.uid}
              type="button"
              className={`hand-card${selected === card.uid ? " selected" : ""}`}
              disabled={!playable}
              aria-pressed={redraw ? undefined : selected === card.uid}
              aria-label={`${redraw ? "Return " : ""}${cardName(card.cardId)}${seen.has(card.uid) ? " (seen by opponent)" : ""}`}
              onClick={() =>
                redraw
                  ? send({ type: "redraw", card: card.uid })
                  : setSelected(selected === card.uid ? null : card.uid)
              }
              data-testid="hand-card"
            >
              <Card cardId={card.cardId} size="hand" />
              {seen.has(card.uid) ? <span className="seen-badge">Seen</span> : null}
            </button>
          );
        })}
      </section>

      {view.phase === "redraw" ? <RedrawPanel view={view} send={send} /> : null}
      {view.phase === "ended" && view.result ? <ResultBanner view={view} /> : null}
    </div>
  );
}

/** Minimal Redraw controls; the full Redraw overlay arrives with the Match flow overlays. */
function RedrawPanel({ view, send }: { view: SeatView; send: (action: Action) => void }) {
  const { returned, done } = view.you.redraw;
  return (
    <div className="redraw-panel" role="dialog" aria-label="Redraw" data-testid="redraw">
      {done ? (
        <p>Waiting for your opponent to Redraw…</p>
      ) : (
        <>
          <p>Redraw: tap up to 2 cards to return them ({returned}/2 returned).</p>
          <button type="button" onClick={() => send({ type: "confirmRedraw" })}>
            Keep hand
          </button>
        </>
      )}
    </div>
  );
}

function TurnLabel({ view }: { view: SeatView }) {
  if (view.phase === "ended") return <div className="turn">Match over</div>;
  if (view.phase === "redraw")
    return (
      <div className="turn" data-testid="turn">
        Redraw
      </div>
    );
  return (
    <div className="turn" data-testid="turn">
      {view.turn === "you" ? "Your Turn" : "Opponent's Turn"}
    </div>
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
