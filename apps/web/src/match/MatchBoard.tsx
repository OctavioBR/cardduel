import type { Action, RowId, SeatView } from "@card-duel/engine";
import { ROWS } from "@card-duel/engine";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Card } from "../cards/Card";
import { useCardDetailPress } from "../cards/CardDetail";
import { cardDef, cardName, cardText } from "../cards/strings";
import accessibility from "../strings/accessibility.en.json";
import { BoardRow, type TargetHandlers } from "./BoardRow";
import { ChoiceOverlay } from "./ChoiceOverlay";
import {
  MatchEndOverlay,
  MatchMenu,
  OpeningOverlay,
  RoundResultOverlay,
  type RoundSummary,
  roundSummary,
} from "./FlowOverlays";
import { LeaderDialog } from "./LeaderDialog";
import { Overlay } from "./Overlay";
import { Piles } from "./Piles";
import { PlayerPanel } from "./PlayerPanel";
import { previewEffects } from "./preview-effects";
import { playableCards, type Target, targetsFor } from "./targets";
import { useCardDrag } from "./useCardDrag";
import { type EventBatch, useEventAnimations } from "./useEventAnimations";

export interface MatchBoardProps {
  view: SeatView;
  send: (action: Action) => void;
  error?: string | null;
  /** The filtered events that produced this view, to animate (#38). */
  events?: EventBatch | undefined;
  onLeave?: () => void;
  /** Offer a Rematch (wired with Rooms in Milestone 7). */
  onRematch?: (() => void) | undefined;
}

/** How long "Confirm Pass" waits for the second press. */
export const PASS_CONFIRM_MS = 3000;

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

/**
 * The full Match stage (ADR-0006). Selecting a hand card highlights its legal targets and
 * shows the server's Play Preview; tapping a target plays it. Targets and outcomes come
 * only from the view (ADR-0002); there are no optimistic updates.
 */
export function MatchBoard({ view, send, error, events, onLeave, onRematch }: MatchBoardProps) {
  // A selection belongs to one view: a new view (new action count) clears it.
  const [selection, setSelection] = useState<{ uid: number; at: number } | null>(null);
  const selected = selection?.at === view.actionCount ? selection.uid : null;
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  // After sending, input stays locked until the next view (or an error) arrives.
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // The whole queue (the opponent's Turn included) plays out before input unlocks.
  const { animating, skip } = useEventAnimations(boardRef, events, view.seat);
  const locked = lockedAt === view.actionCount || animating;
  const [passConfirm, setPassConfirm] = useState<{ at: number } | null>(null);
  const confirmingPass = passConfirm?.at === view.actionCount;
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [roundResult, setRoundResult] = useState<RoundSummary | null>(null);
  const shownBatch = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!events || events.seq === shownBatch.current) return;
    shownBatch.current = events.seq;
    const summary = roundSummary(events.events, view.seat);
    if (summary) setRoundResult(summary);
  }, [events, view.seat]);
  const [knownOpen, setKnownOpen] = useState(false);
  const pointerType = useRef<string>("mouse");

  useEffect(() => {
    if (error) setLockedAt(null);
  }, [error]);

  useEffect(() => {
    if (!confirmingPass) return;
    const timer = setTimeout(() => setPassConfirm(null), PASS_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingPass]);

  const targets = selected === null ? [] : targetsFor(view, selected);
  const activeTarget =
    targets.find((t) => t.key === previewKey) ??
    (targets.length === 1 ? targets[0] : undefined) ??
    null;
  const effects = previewEffects(view, activeTarget?.action ?? null);
  const playable = playableCards(view);
  const canPass = view.legalActions.some((a) => a.type === "pass");
  const weathered = weatheredRows(view);
  const seen = new Set(view.you.seenByOpponent);

  const focusTarget = (key: string | undefined) => {
    if (!key) return;
    requestAnimationFrame(() =>
      boardRef.current
        ?.querySelector<HTMLElement>(`[data-target-key="${CSS.escape(key)}"]`)
        ?.focus(),
    );
  };

  const cancel = () => {
    const uid = selected;
    setSelection(null);
    setPreviewKey(null);
    if (uid !== null) {
      requestAnimationFrame(() =>
        boardRef.current?.querySelector<HTMLElement>(`[data-hand-uid="${uid}"]`)?.focus(),
      );
    }
  };

  const selectCard = (uid: number, viaKeyboard: boolean) => {
    if (locked) return;
    if (selected === uid) {
      cancel();
      return;
    }
    setSelection({ uid, at: view.actionCount });
    const cardTargets = targetsFor(view, uid);
    const first = cardTargets[0];
    setPreviewKey(cardTargets.length === 1 || viaKeyboard ? (first?.key ?? null) : null);
    if (viaKeyboard) focusTarget(first?.key);
  };

  /** Sends an action and locks input until the next view arrives. */
  const sendLocked = (action: Action) => {
    setLockedAt(view.actionCount);
    send(action);
  };

  const play = (target: Target) => {
    setSelection(null);
    setPreviewKey(null);
    sendLocked(target.action);
  };

  const handlers: TargetHandlers = {
    onActivate: (target) => {
      if (locked) return;
      // Touch: the first tap on one of several targets previews it, the second plays.
      if (pointerType.current === "touch" && targets.length > 1 && previewKey !== target.key) {
        setPreviewKey(target.key);
        return;
      }
      play(target);
    },
    onHover: (target) => {
      if (target) setPreviewKey(target.key);
      else if (targets.length > 1) setPreviewKey(null);
    },
    onPointerDown: (e) => {
      pointerType.current = e.pointerType;
    },
    disabled: locked,
  };

  // Drag and tap coexist: a press without movement is a tap (#37).
  const latest = useRef({ targets, play, cancel });
  latest.current = { targets, play, cancel };
  const longPress = useCardDetailPress();
  const dragging = useCardDrag({
    boardRef,
    blocked: longPress,
    onStart: (uid) => {
      setSelection({ uid, at: view.actionCount });
      setPreviewKey(null);
    },
    onOver: (key) => setPreviewKey(key),
    onDrop: (key) => {
      const target = latest.current.targets.find((t) => t.key === key);
      if (target) latest.current.play(target);
      else {
        setSelection(null);
        setPreviewKey(null);
      }
    },
  });

  const pass = () => {
    if (!canPass || locked) return;
    // Two steps while the hand is not empty: the button becomes "Confirm Pass" for 3 seconds.
    if (view.you.hand.length > 0 && !confirmingPass) {
      setPassConfirm({ at: view.actionCount });
      return;
    }
    setPassConfirm(null);
    setLockedAt(view.actionCount);
    send({ type: "pass" });
  };

  const onKey = (e: {
    key: string;
    target: EventTarget | null;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    preventDefault: () => void;
    defaultPrevented: boolean;
  }) => {
    if (e.target instanceof HTMLInputElement || e.defaultPrevented) return;
    if (animating) {
      // While events animate, Esc, Enter or Space skips to the final state.
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        skip();
      }
      return;
    }
    if (e.key === "Escape") {
      if (confirmingPass) setPassConfirm(null);
      if (selected !== null) cancel();
      return;
    }
    if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      pass();
      return;
    }
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;
    const step = forward ? 1 : -1;
    e.preventDefault();
    if (selected !== null && targets.length > 0) {
      const i = targets.findIndex((t) => t.key === previewKey);
      const next = targets[(i + step + targets.length) % targets.length] as Target;
      setPreviewKey(next.key);
      focusTarget(next.key);
      return;
    }
    const cards = [
      ...(boardRef.current?.querySelectorAll<HTMLElement>(".hand-card:not(:disabled)") ?? []),
    ];
    if (cards.length === 0) return;
    const i = cards.indexOf(document.activeElement as HTMLElement);
    (cards[(i + step + cards.length) % cards.length] as HTMLElement).focus();
  };

  // Keyboard play works wherever focus is on the page, as long as no dialog is open.
  useEffect(() => {
    const onWindowKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onKey(e);
    };
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  });

  const rowTarget = (side: "you" | "opponent", row: RowId) =>
    targets.find((t) => t.kind === "row" && t.side === side && t.row === row);
  const hornTarget = (row: RowId) => targets.find((t) => t.kind === "horn" && t.row === row);
  const unitTargets = new Map(
    targets.flatMap((t) => (t.kind === "unit" ? [[t.uid, t] as const] : [])),
  );
  const battlefield = targets.find((t) => t.kind === "battlefield");
  const selectedName =
    selected === null ? "" : cardName(view.you.hand.find((c) => c.uid === selected)?.cardId ?? "");
  const noUnitTargets = new Map<number, Target>();

  return (
    <div
      className={`board${locked ? " locked" : ""}`}
      data-testid="board"
      data-action-count={view.actionCount}
      data-animating={animating ? "true" : undefined}
      ref={boardRef}
      onClickCapture={(e) => {
        // A click anywhere skips to the final state.
        if (!animating) return;
        e.stopPropagation();
        e.preventDefault();
        skip();
      }}
    >
      <div className="anim-layer" aria-hidden="true" />
      {view.phase !== "ended" ? (
        <MatchMenu onForfeit={() => sendLocked({ type: "forfeit" })} disabled={false} />
      ) : null}
      <aside className="side">
        <PlayerPanel
          who="opponent"
          faction={view.opponent.faction}
          leader={view.opponent.leader}
          gems={view.opponent.gems}
          score={view.board.opponent.score}
          scoreDelta={effects?.totalDelta.opponent ?? 0}
          passed={view.opponent.passed}
          handSize={view.opponent.handSize}
          active={view.turn === "opponent"}
          knownHand={view.opponent.knownHand}
          onKnownHand={() => setKnownOpen(true)}
        />
        <div className="round-info">
          <section className="weather-zone" aria-label="Weather">
            {view.weather.length === 0 ? <span className="empty">No Weather</span> : null}
            {view.weather.map((w) => (
              <span key={w.uid} data-anim-uid={w.uid}>
                <Card cardId={w.cardId} size="token" />
              </span>
            ))}
          </section>
          <div>Round {view.round}</div>
          <TurnLabel view={view} />
          {view.opponentChoosing ? <div className="notice">Your opponent is choosing…</div> : null}
          {view.phase === "turns" && view.opponent.passed ? (
            <div className="opponent-passed" role="status" data-testid="opponent-passed">
              Your opponent Passed
            </div>
          ) : null}
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
          scoreDelta={effects?.totalDelta.you ?? 0}
          passed={view.you.passed}
          handSize={view.you.hand.length}
          active={view.turn === "you"}
          onLeader={() => setLeaderOpen(true)}
        />
        <button
          type="button"
          className={`pass-button${confirmingPass ? " confirming" : ""}`}
          disabled={!canPass || locked}
          onClick={pass}
          aria-keyshortcuts="P"
        >
          {confirmingPass ? "Confirm Pass" : "Pass"}
        </button>
      </aside>

      <section className="field" aria-label="Battlefield">
        {[...ROWS].reverse().map((row) => (
          <BoardRow
            key={`o-${row}`}
            side="opponent"
            row={row}
            view={view.board.opponent.rows[row]}
            weathered={weathered.has(row)}
            rowTarget={rowTarget("opponent", row)}
            unitTargets={noUnitTargets}
            previewKey={activeTarget?.key ?? null}
            effects={effects}
            handlers={handlers}
          />
        ))}
        <div className="divider" />
        {ROWS.map((row) => (
          <BoardRow
            key={`y-${row}`}
            side="you"
            row={row}
            view={view.board.you.rows[row]}
            weathered={weathered.has(row)}
            rowTarget={rowTarget("you", row)}
            hornTarget={hornTarget(row)}
            unitTargets={unitTargets}
            previewKey={activeTarget?.key ?? null}
            effects={effects}
            handlers={handlers}
          />
        ))}
        {battlefield ? (
          <button
            type="button"
            className="battlefield-target"
            aria-label={`Play ${selectedName} on the battlefield`}
            data-target-key={battlefield.key}
            disabled={locked}
            onPointerDown={handlers.onPointerDown}
            onClick={() => handlers.onActivate(battlefield)}
          >
            <span>Play {selectedName}</span>
          </button>
        ) : null}
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
        {effects && effects.drawn > 0 ? (
          <span className="draw-preview" data-testid="draw-preview">
            +{effects.drawn} cards
          </span>
        ) : null}
        {view.you.hand.map((card) => {
          const redraw = view.phase === "redraw";
          const legal = redraw
            ? view.legalActions.some((a) => a.type === "redraw" && a.card === card.uid)
            : playable.has(card.uid);
          return (
            <button
              key={card.uid}
              type="button"
              className={`hand-card${selected === card.uid ? " selected" : ""}`}
              disabled={locked || !legal}
              aria-describedby={`hand-description-${card.uid}`}
              aria-pressed={redraw ? undefined : selected === card.uid}
              aria-label={`${redraw ? "Return " : ""}${cardName(card.cardId)}${seen.has(card.uid) ? " (seen by opponent)" : ""}`}
              data-hand-uid={card.uid}
              data-anim-uid={card.uid}
              data-dragging={dragging.drag?.uid === card.uid ? "true" : undefined}
              onPointerDown={redraw || locked || !legal ? undefined : dragging.start(card.uid)}
              onClick={(e: MouseEvent) => {
                if (dragging.shouldIgnoreClick()) return;
                if (redraw) send({ type: "redraw", card: card.uid });
                else selectCard(card.uid, e.detail === 0);
              }}
              data-testid="hand-card"
            >
              <Card cardId={card.cardId} size="hand" />
              <span className="visually-hidden" id={`hand-description-${card.uid}`}>
                {(() => {
                  const definition = cardDef(card.cardId);
                  return `${definition?.kind === "unit" ? `${accessibility.strength} ${definition.strength}. ` : ""}${cardText(card.cardId)}`;
                })()}
              </span>
              {seen.has(card.uid) ? <span className="seen-badge">Seen</span> : null}
            </button>
          );
        })}
      </section>

      {dragging.drag ? (
        <div
          className="drag-ghost"
          style={{ left: dragging.drag.x, top: dragging.drag.y }}
          aria-hidden="true"
          data-testid="drag-ghost"
        >
          <Card
            cardId={view.you.hand.find((c) => c.uid === dragging.drag?.uid)?.cardId ?? ""}
            size="hand"
          />
        </div>
      ) : null}
      {view.phase === "redraw" ? (
        <OpeningOverlay view={view} send={sendLocked} locked={locked} />
      ) : null}
      {roundResult && !animating && view.phase !== "ended" ? (
        <RoundResultOverlay summary={roundResult} onContinue={() => setRoundResult(null)} />
      ) : null}
      {view.pendingChoice ? <ChoiceOverlay view={view} send={sendLocked} locked={locked} /> : null}
      {leaderOpen && !view.pendingChoice ? (
        <LeaderDialog
          view={view}
          send={sendLocked}
          locked={locked}
          onClose={() => setLeaderOpen(false)}
        />
      ) : null}
      {knownOpen ? (
        <Overlay title="Cards seen in your opponent's hand" onClose={() => setKnownOpen(false)}>
          <div className="overlay-cards">
            {view.opponent.knownHand.length === 0 ? (
              <p className="overlay-empty">None are left in their hand.</p>
            ) : null}
            {view.opponent.knownHand.map((c) => (
              <Card key={c.uid} cardId={c.cardId} size="tile" />
            ))}
          </div>
        </Overlay>
      ) : null}
      {view.phase === "ended" && view.result && !animating ? (
        <MatchEndOverlay view={view} onRematch={onRematch} onLeave={onLeave ?? (() => {})} />
      ) : null}
    </div>
  );
}

function TurnLabel({ view }: { view: SeatView }) {
  if (view.phase === "ended")
    return (
      <div className="turn" data-testid="turn">
        Match over
      </div>
    );
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
