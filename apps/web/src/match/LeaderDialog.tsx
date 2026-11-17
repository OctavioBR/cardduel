import type { Action, SeatView } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { Card } from "../cards/Card";
import { ROW_LABEL } from "../cards/icons";
import { cardName, cardText } from "../cards/strings";
import copy from "../strings/en.json";
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
    <Overlay title={formatCopy(copy.leader, { p0: cardName(leader.cardId) })} onClose={onClose}>
      <div className="leader-dialog">
        <Card cardId={leader.cardId} size="tile" />
        <div className="leader-body">
          <p>{cardText(leader.cardId)}</p>
          {uses.length === 0 ? (
            <p className="muted">
              {leader.passive
                ? copy.aPassiveLeaderItsRuleIs
                : leader.used
                  ? copy.alreadyUsedThisMatch
                  : view.you.passed
                    ? copy.youHavePassedThisRound
                    : view.turn !== "you"
                      ? copy.waitForYourTurn
                      : copy.nothingToUseItOnRight}
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
                  {use.row
                    ? formatCopy(copy.useOnYourRow, { p0: ROW_LABEL[use.row] })
                    : copy.useLeaderAbility}
                </button>
                <PreviewSummary view={view} preview={use.preview} />
              </div>
            ) : null,
          )}
          <p className="muted">
            {copy.state}
            {state.text}
          </p>
        </div>
      </div>
    </Overlay>
  );
}
