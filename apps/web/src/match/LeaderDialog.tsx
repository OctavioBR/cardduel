import type { Action, SeatView } from "@card-duel/engine";
import { Card } from "../cards/Card";
import { ROW_LABEL } from "../cards/icons";
import { cardName, cardText } from "../cards/strings";
import { Overlay } from "./Overlay";
import { leaderState } from "./PlayerPanel";
import { PreviewSummary } from "./PreviewSummary";

/** Shows your Leader's ability and its Play Preview; a confirm button uses it. */
export function LeaderDialog({
  view,
  send,
  onClose,
  locked,
}: {
  view: SeatView;
  send: (action: Action) => void;
  onClose: () => void;
  locked: boolean;
}) {
  const leader = view.you.leader;
  const uses = view.legalActions.filter((a) => a.type === "leader");
  const state = leaderState(leader);
  return (
    <Overlay title={`Leader: ${cardName(leader.cardId)}`} onClose={onClose}>
      <div className="leader-dialog">
        <Card cardId={leader.cardId} size="tile" />
        <div className="leader-body">
          <p>{cardText(leader.cardId)}</p>
          {uses.length === 0 ? (
            <p className="muted">
              {leader.passive
                ? "A passive Leader: its rule is always on."
                : leader.used
                  ? "Already used this Match."
                  : view.you.passed
                    ? "You have Passed this Round."
                    : view.turn !== "you"
                      ? "Wait for your Turn."
                      : "Nothing to use it on right now."}
            </p>
          ) : null}
          {uses.map((use) =>
            use.type === "leader" ? (
              <div key={use.row ?? "use"} className="leader-use">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    send(use);
                    onClose();
                  }}
                >
                  {use.row ? `Use on your ${ROW_LABEL[use.row]} Row` : "Use Leader ability"}
                </button>
                <PreviewSummary view={view} preview={use.preview} />
              </div>
            ) : null,
          )}
          <p className="muted">State: {state.text}</p>
        </div>
      </div>
    </Overlay>
  );
}
