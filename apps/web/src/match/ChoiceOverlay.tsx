import type { Action, PendingKind, SeatView } from "@card-duel/engine";
import { Card } from "../cards/Card";
import { ROW_LABEL } from "../cards/icons";
import { cardName } from "../cards/strings";
import { Overlay } from "./Overlay";
import { PreviewSummary } from "./PreviewSummary";

const TITLE: Record<PendingKind, string> = {
  medic: "Medic: choose a Unit from your Discard Pile to Play",
  leaderWeather: "Choose a Weather card from your deck to play",
  leaderReturn: "Choose a card to return from your Discard Pile to your hand",
  leaderDraw: "Choose a card to draw from your deck",
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
          const where = option.row ? ` to ${ROW_LABEL[option.row]}` : "";
          return (
            <button
              key={`${option.card ?? option.cardId}-${option.row ?? ""}`}
              type="button"
              className="choice-option"
              disabled={locked}
              onClick={() => send(option)}
              aria-label={`Choose ${cardName(cardId)}${where}`}
            >
              <Card cardId={cardId} size="tile" />
              {option.row ? <span className="choice-row">{ROW_LABEL[option.row]} Row</span> : null}
              <PreviewSummary view={view} preview={option.preview} />
            </button>
          );
        })}
      </div>
    </Overlay>
  );
}
