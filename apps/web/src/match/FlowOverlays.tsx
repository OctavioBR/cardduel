import type { Action, MatchEvent, Seat, SeatView } from "@card-duel/engine";
import { useCallback, useState } from "react";
import { Card } from "../cards/Card";
import { cardName } from "../cards/strings";
import roomStrings from "../room/strings/en.json";
import { Overlay } from "./Overlay";

const FACTION_NAME = { swarm: "Swarm", court: "Court" } as const;

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
    <Overlay title="Match start">
      <div className="reveal" data-testid="reveal">
        <div className="reveal-side">
          <span className="reveal-label">You · {FACTION_NAME[view.you.faction]}</span>
          <Card cardId={view.you.leader.cardId} size="tile" />
        </div>
        <div className="reveal-vs">
          <strong>vs</strong>
          <span data-testid="coin-flip">
            Coin flip:{" "}
            {view.roundStarter === "you"
              ? "you take the first Turn"
              : "your opponent takes the first Turn"}
          </span>
        </div>
        <div className="reveal-side">
          <span className="reveal-label">Opponent · {FACTION_NAME[view.opponent.faction]}</span>
          <Card cardId={view.opponent.leader.cardId} size="tile" />
        </div>
      </div>
      {done ? (
        <p className="redraw-wait" data-testid="redraw-wait">
          You returned {returned} card{returned === 1 ? "" : "s"}. Waiting for your opponent to
          Redraw…
        </p>
      ) : (
        <div className="redraw" data-testid="redraw">
          <p>
            Redraw: return up to 2 cards, one at a time; each is shuffled back and replaced (
            {returned}/2 returned).
            {view.opponent.redraw.returned > 0
              ? ` Your opponent has returned ${view.opponent.redraw.returned}.`
              : ""}
          </p>
          <div className="overlay-cards redraw-hand">
            {view.you.hand.map((card) => (
              <button
                key={card.uid}
                type="button"
                className="redraw-card"
                disabled={locked}
                aria-label={`Return ${cardName(card.cardId)}`}
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
            {returned === 0 ? "Keep hand" : "Done"}
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
    const whose = e.seat === seat ? "Your" : "Your opponent's";
    passives.push(
      e.faction === "court"
        ? `${whose} Court won the Tie.`
        : `${whose} Swarm kept ${cardName(e.card.cardId)} on the battlefield.`,
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
      ? `Round ${summary.round}: Tie`
      : summary.winner === "you"
        ? `Round ${summary.round}: you win`
        : `Round ${summary.round}: your opponent wins`;
  return (
    <Overlay title={title} onClose={onContinue}>
      <div className="round-result" data-testid="round-result">
        <div className="round-scores">
          <span>
            You <strong>{summary.scores.you}</strong>
          </span>
          <span>
            Opponent <strong>{summary.scores.opponent}</strong>
          </span>
        </div>
        <p>
          Gems lost: you {summary.gemsLost.you}, your opponent {summary.gemsLost.opponent}.
        </p>
        {summary.passives.map((p) => (
          <p key={p} className="passive-note">
            {p}
          </p>
        ))}
        <button type="button" className="primary" ref={focusRef} onClick={onContinue}>
          Continue
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
    result.outcome === "draw" ? "Draw" : won ? "You won the Match" : "You lost the Match";
  const reason =
    result.outcome === "win" && result.reason === "forfeit"
      ? won
        ? "Your opponent Forfeited."
        : "You Forfeited."
      : result.outcome === "win" && result.reason === "disconnect"
        ? won
          ? roomStrings.disconnectWon
          : roomStrings.disconnectLost
        : result.outcome === "draw"
          ? "Both players lost their last Gem in the same Round."
          : null;
  return (
    <Overlay title="Match over">
      <div className="match-end">
        <p className="match-end-result" role="status" data-testid="result">
          {text}
        </p>
        {reason ? <p className="muted">{reason}</p> : null}
        <p className="muted">
          Gems left: you {view.you.gems}, your opponent {view.opponent.gems}.
        </p>
        <div className="match-end-actions">
          <button type="button" className="primary" onClick={onRematch} disabled={!onRematch}>
            Rematch
          </button>
          <button type="button" onClick={onLeave}>
            Leave
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
        Menu
      </button>
      {open === "menu" ? (
        <Overlay title="Menu" onClose={() => setOpen(null)}>
          <div className="menu-items">
            <button type="button" onClick={() => setOpen("confirm")}>
              Forfeit
            </button>
          </div>
        </Overlay>
      ) : null}
      {open === "confirm" ? (
        <Overlay title="Forfeit this Match?" onClose={() => setOpen(null)}>
          <p>Your opponent wins, and it counts as a loss on your Record.</p>
          <div className="match-end-actions">
            <button
              type="button"
              className="danger"
              onClick={() => {
                setOpen(null);
                onForfeit();
              }}
            >
              Forfeit
            </button>
            <button type="button" onClick={() => setOpen(null)}>
              Keep playing
            </button>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}
