import type { CardRef, FactionId, LeaderView } from "@card-duel/engine";
import { cardName } from "../cards/strings";

const FACTION_NAME: Record<FactionId, string> = { swarm: "Swarm", court: "Court" };

export function leaderState(leader: LeaderView): { text: string; ready: boolean } {
  if (leader.passive) return { text: "Passive", ready: false };
  if (leader.used) return { text: "Used", ready: false };
  return { text: "Ready", ready: true };
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
}) {
  const state = leaderState(props.leader);
  const name = props.who === "you" ? "You" : "Opponent";
  return (
    <section
      className={`player-panel f-${props.faction}${props.active ? " active" : ""}`}
      aria-label={`${name}: ${FACTION_NAME[props.faction]}`}
      data-testid={`panel-${props.who}`}
    >
      <div
        className={`leader-chip f-${props.faction}`}
        role="img"
        aria-label={`Leader ${cardName(props.leader.cardId)}, ${state.text}`}
      >
        <span>{cardName(props.leader.cardId)}</span>
        <span className={`leader-state${state.ready ? " ready" : ""}`}>{state.text}</span>
      </div>
      <div className="player-info">
        <span className="player-name">{name}</span>
        <span>{FACTION_NAME[props.faction]}</span>
        <div className="gems" role="img" aria-label={`${props.gems} Gems`}>
          {[0, 1].map((i) => (
            <span key={i} className={i < props.gems ? "gem on" : "gem"} />
          ))}
        </div>
        <span>Hand {props.handSize}</span>
        {props.passed ? <span className="passed">Passed</span> : null}
        {props.knownHand && props.knownHand.length > 0 ? (
          <span className="known-hand">
            Seen in hand: {props.knownHand.map((c) => cardName(c.cardId)).join(", ")}
          </span>
        ) : null}
      </div>
      <div
        className="total-score"
        role="img"
        data-testid={`score-${props.who}`}
        aria-label={`Score ${props.score}`}
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
