import type { Action, PendingKind, SeatView } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { Card } from "../cards/Card";
import { ROW_LABEL } from "../cards/icons";
import { cardName } from "../cards/strings";
import copy from "../strings/en.json";
import { Overlay } from "./Overlay";
import { PreviewSummary } from "./PreviewSummary";

const TITLE: Record<PendingKind, string> = {
  medic: copy.medicChooseAUnitFromYour,
  leaderWeather: copy.chooseAWeatherCardFromYour,
  leaderReturn: copy.chooseACardToReturnFrom,
  leaderDraw: copy.chooseACardToDrawFrom,
};

/** A Pending Choice (GLOSSARY.md): it cannot be dismissed, so the overlay has no close button. */
export function ChoiceOverlay({
  view,
  send,
  locked,
}: {
  view: SeatView;
  send: (action: Action) => void;
  locked: boolean;
}) {
  const kind = view.pendingChoice?.kind;
  if (!kind) return null;
  const options = view.legalActions.filter((a) => a.type === "choose");
  const cardIdOf = (a: (typeof options)[number]) =>
    a.type !== "choose"
      ? ""
      : (a.cardId ??
        [...view.you.discard, ...view.you.hand].find((c) => c.uid === a.card)?.cardId ??
        "");
  return (
    <Overlay title={TITLE[kind]}>
      <div className="overlay-cards choice-options">
        {options.map((option) => {
          if (option.type !== "choose") return null;
          const cardId = cardIdOf(option);
          const where = option.row ? formatCopy(copy.to, { p0: ROW_LABEL[option.row] }) : "";
          return (
            <button
              key={`${option.card ?? option.cardId}-${option.row ?? ""}`}
              type="button"
              className="choice-option"
              disabled={locked}
              onClick={() => send(option)}
              aria-label={formatCopy(copy.choose, { p0: cardName(cardId), p1: where })}
            >
              <Card cardId={cardId} size="tile" />
              {option.row ? (
                <span className="choice-row">
                  {ROW_LABEL[option.row]}
                  {copy.row}
                </span>
              ) : null}
              <PreviewSummary view={view} preview={option.preview} />
            </button>
          );
        })}
      </div>
    </Overlay>
  );
}
