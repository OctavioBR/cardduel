import type { Action, MatchEvent, Seat, SeatView } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { useCallback, useState } from "react";
import { Card } from "../cards/Card";
import { cardName } from "../cards/strings";
import roomStrings from "../room/strings/en.json";
import copy from "../strings/en.json";
import { Overlay } from "./Overlay";

const FACTION_NAME = { swarm: copy.swarm, court: copy.court } as const;

/**
 * A callback ref that focuses the element each time it mounts: the main action of an overlay,
 * for keyboard players. (A plain effect would miss a button that remounts inside an open overlay.)
 */
function useFocusOnMount<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    el?.focus();
  }, []);
}

/** Faction and Leader reveal with the coin flip, then the private Redraw (GLOSSARY.md). */
export function OpeningOverlay({
  view,
  send,
  locked,
}: {
  view: SeatView;
  send: (a: Action) => void;
  locked: boolean;
}) {
  const focusRef = useFocusOnMount<HTMLButtonElement>();
  const { returned, done } = view.you.redraw;
  return (
    <Overlay title={copy.matchStart}>
      <div className="reveal" data-testid="reveal">
        <div className="reveal-side">
          <span className="reveal-label">
            {copy.you}
            {FACTION_NAME[view.you.faction]}
          </span>
          <Card cardId={view.you.leader.cardId} size="tile" />
        </div>
        <div className="reveal-vs">
          <strong>{copy.vs}</strong>
          <span data-testid="coin-flip">
            {copy.coinFlip}{" "}
            {view.roundStarter === "you"
              ? copy.youTakeTheFirstTurn
              : copy.opponentTakesTheFirstTurn}
          </span>
        </div>
        <div className="reveal-side">
          <span className="reveal-label">
            {copy.opponent}
            {FACTION_NAME[view.opponent.faction]}
          </span>
          <Card cardId={view.opponent.leader.cardId} size="tile" />
        </div>
      </div>
      {done ? (
        <p className="redraw-wait" data-testid="redraw-wait">
          {copy.youReturned}
          {returned}
          {copy.card}
          {returned === 1 ? "" : "s"}
          {copy.waitingForYourOpponentToRedraw}
        </p>
      ) : (
        <div className="redraw" data-testid="redraw">
          <p>
            {copy.redrawReturnUpTo2Cards}
            {returned}
            {copy.text2Returned}
            {view.opponent.redraw.returned > 0
              ? formatCopy(copy.yourOpponentHasReturned, { p0: view.opponent.redraw.returned })
              : ""}
          </p>
          <div className="overlay-cards redraw-hand">
            {view.you.hand.map((card) => (
              <button
                key={card.uid}
                type="button"
                className="redraw-card"
                disabled={locked}
                aria-label={formatCopy(copy.return, { p0: cardName(card.cardId) })}
                onClick={() => send({ type: "redraw", card: card.uid })}
              >
                <Card cardId={card.cardId} size="tile" />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary"
            ref={focusRef}
            disabled={locked}
            onClick={() => send({ type: "confirmRedraw" })}
          >
            {returned === 0 ? copy.keepHand : copy.done}
          </button>
        </div>
      )}
    </Overlay>
  );
}

export interface RoundSummary {
  round: number;
  scores: { you: number; opponent: number };
  gemsLost: { you: number; opponent: number };
  winner: "you" | "opponent" | null;
  passives: string[];
}

/** Builds the Round result from a batch of events, from the Seat's point of view. */
export function roundSummary(events: readonly MatchEvent[], seat: Seat): RoundSummary | null {
  const ended = events.find((e) => e.type === "roundEnded");
  if (ended?.type !== "roundEnded") return null;
  const other: Seat = seat === 0 ? 1 : 0;
  const who = (s: Seat) => (s === seat ? "you" : "opponent");
  const passives: string[] = [];
  for (const e of events) {
    if (e.type !== "factionPassive") continue;
    const whose = e.seat === seat ? copy.your : copy.yourOpponentS;
    passives.push(
      e.faction === "court"
        ? formatCopy(copy.courtWonTheTie, { p0: whose })
        : formatCopy(copy.swarmKeptOnTheBattlefield, { p0: whose, p1: cardName(e.card.cardId) }),
    );
  }
  return {
    round: ended.round,
    scores: { you: ended.scores[seat], opponent: ended.scores[other] },
    gemsLost: { you: ended.winner === seat ? 0 : 1, opponent: ended.winner === other ? 0 : 1 },
    winner: ended.winner === null ? null : who(ended.winner),
    passives,
  };
}

export function RoundResultOverlay({
  summary,
  onContinue,
}: {
  summary: RoundSummary;
  onContinue: () => void;
}) {
  const focusRef = useFocusOnMount<HTMLButtonElement>();
  const title =
    summary.winner === null
      ? formatCopy(copy.roundTie, { p0: summary.round })
      : summary.winner === "you"
        ? formatCopy(copy.roundYouWin, { p0: summary.round })
        : formatCopy(copy.roundYourOpponentWins, { p0: summary.round });
  return (
    <Overlay title={title} onClose={onContinue}>
      <div className="round-result" data-testid="round-result">
        <div className="round-scores">
          <span>
            {copy.you2}
            <strong>{summary.scores.you}</strong>
          </span>
          <span>
            {copy.opponent2}
            <strong>{summary.scores.opponent}</strong>
          </span>
        </div>
        <p>
          {copy.gemsLostYou}
          {summary.gemsLost.you}
          {copy.yourOpponent}
          {summary.gemsLost.opponent}
          {copy.label2}
        </p>
        {summary.passives.map((p) => (
          <p key={p} className="passive-note">
            {p}
          </p>
        ))}
        <button type="button" className="primary" ref={focusRef} onClick={onContinue}>
          {copy.continue}
        </button>
      </div>
    </Overlay>
  );
}

export function MatchEndOverlay({
  view,
  onRematch,
  onLeave,
}: {
  view: SeatView;
  onRematch?: (() => void) | undefined;
  onLeave: () => void;
}) {
  const result = view.result;
  if (!result) return null;
  const won = result.outcome === "win" && result.winner === view.seat;
  const text =
    result.outcome === "draw" ? copy.draw : won ? copy.youWonTheMatch : copy.youLostTheMatch;
  const reason =
    result.outcome === "win" && result.reason === "forfeit"
      ? won
        ? copy.yourOpponentForfeited
        : copy.youForfeited
      : result.outcome === "win" && result.reason === "disconnect"
        ? won
          ? roomStrings.disconnectWon
          : roomStrings.disconnectLost
        : result.outcome === "draw"
          ? copy.bothPlayersLostTheirLastGem
          : null;
  return (
    <Overlay title={copy.matchOver}>
      <div className="match-end">
        <p className="match-end-result" role="status" data-testid="result">
          {text}
        </p>
        {reason ? <p className="muted">{reason}</p> : null}
        <p className="muted">
          {copy.gemsLeftYou}
          {view.you.gems}
          {copy.yourOpponent}
          {view.opponent.gems}
          {copy.label2}
        </p>
        <div className="match-end-actions">
          <button type="button" className="primary" onClick={onRematch} disabled={!onRematch}>
            {copy.rematch}
          </button>
          <button type="button" onClick={onLeave}>
            {copy.leave}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/** A menu with Forfeit, confirmed on the page (no browser dialogs). */
export function MatchMenu({ onForfeit, disabled }: { onForfeit: () => void; disabled: boolean }) {
  const [open, setOpen] = useState<"menu" | "confirm" | null>(null);
  return (
    <>
      <button
        type="button"
        className="menu-button"
        onClick={() => setOpen("menu")}
        disabled={disabled}
        aria-haspopup="dialog"
      >
        {copy.menu}
      </button>
      {open === "menu" ? (
        <Overlay title={copy.menu} onClose={() => setOpen(null)}>
          <div className="menu-items">
            <button type="button" onClick={() => setOpen("confirm")}>
              {copy.forfeit}
            </button>
          </div>
        </Overlay>
      ) : null}
      {open === "confirm" ? (
        <Overlay title={copy.forfeitThisMatch} onClose={() => setOpen(null)}>
          <p>{copy.yourOpponentWinsAndItCounts}</p>
          <div className="match-end-actions">
            <button
              type="button"
              className="danger"
              onClick={() => {
                setOpen(null);
                onForfeit();
              }}
            >
              {copy.forfeit}
            </button>
            <button type="button" onClick={() => setOpen(null)}>
              {copy.keepPlaying}
            </button>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}
