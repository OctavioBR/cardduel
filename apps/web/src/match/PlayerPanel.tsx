import type { CardRef, FactionId, LeaderView } from "@card-duel/engine";
import { cardName } from "../cards/strings";
import copy from "../strings/en.json";
import { formatCopy } from "../strings/format";

const FACTION_NAME: Record<FactionId, string> = { swarm: copy.swarm, court: copy.court };

export function leaderState(leader: LeaderView): { text: string; ready: boolean } {
  if (leader.passive) return { text: copy.passive, ready: false };
  if (leader.used) return { text: copy.used, ready: false };
  return { text: copy.ready, ready: true };
}

export function PlayerPanel(props: {
  who: "you" | "opponent";
  faction: FactionId;
  leader: LeaderView;
  gems: number;
  score: number;
  passed: boolean;
  handSize: number;
  active: boolean;
  knownHand?: CardRef[];
  scoreDelta?: number;
  /** Opens the Leader dialog (your own panel only). */
  onLeader?: () => void;
  /** Opens the cards seen in the opponent's hand. */
  onKnownHand?: () => void;
}) {
  const state = leaderState(props.leader);
  const name = props.who === "you" ? copy.you3 : copy.opponent3;
  return (
    <section
      className={`player-panel f-${props.faction}${props.active ? " active" : ""}`}
      aria-label={`${name}: ${FACTION_NAME[props.faction]}`}
      data-testid={`panel-${props.who}`}
    >
      {props.onLeader ? (
        <button
          type="button"
          className={`leader-chip f-${props.faction}`}
          onClick={props.onLeader}
          aria-label={formatCopy(copy.leader2, {
            p0: cardName(props.leader.cardId),
            p1: state.text,
          })}
          data-testid="your-leader"
        >
          <span>{cardName(props.leader.cardId)}</span>
          <span className={`leader-state${state.ready ? " ready" : ""}`}>{state.text}</span>
        </button>
      ) : (
        <div
          className={`leader-chip f-${props.faction}`}
          role="img"
          aria-label={formatCopy(copy.leader2, {
            p0: cardName(props.leader.cardId),
            p1: state.text,
          })}
        >
          <span>{cardName(props.leader.cardId)}</span>
          <span className={`leader-state${state.ready ? " ready" : ""}`}>{state.text}</span>
        </div>
      )}
      <div className="player-info">
        <span className="player-name">{name}</span>
        <span>{FACTION_NAME[props.faction]}</span>
        <div className="gems" role="img" aria-label={formatCopy(copy.gems, { p0: props.gems })}>
          {[0, 1].map((i) => (
            <span key={i} className={i < props.gems ? "gem on" : "gem"} />
          ))}
        </div>
        <span>
          {copy.hand}
          {props.handSize}
        </span>
        {props.passed ? <span className="passed">{copy.passed}</span> : null}
        {props.knownHand && props.knownHand.length > 0 ? (
          <button type="button" className="known-hand" onClick={props.onKnownHand}>
            {copy.seenInHand}
            {props.knownHand.map((c) => cardName(c.cardId)).join(", ")}
          </button>
        ) : null}
      </div>
      <div
        className="total-score"
        role="img"
        data-testid={`score-${props.who}`}
        aria-label={formatCopy(copy.score, { p0: props.score })}
      >
        {props.score}
        {props.scoreDelta ? (
          <span
            className={`delta total ${props.scoreDelta > 0 ? "up" : "down"}`}
            data-testid={`total-delta-${props.who}`}
          >
            {props.scoreDelta > 0 ? `+${props.scoreDelta}` : props.scoreDelta}
          </span>
        ) : null}
      </div>
    </section>
  );
}
