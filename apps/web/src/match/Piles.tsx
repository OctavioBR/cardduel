import type { CardRef, DeckCount, FactionId } from "@card-duel/engine";
import { useState } from "react";
import { Card } from "../cards/Card";
import copy from "../strings/en.json";
import { formatCopy } from "../strings/format";
import { Overlay } from "./Overlay";

type Browse = "yourDiscard" | "opponentDiscard" | "yourDeck" | null;

export function Piles(props: {
  yourFaction: FactionId;
  opponentFaction: FactionId;
  yourDeck: DeckCount[];
  yourDeckSize: number;
  yourDiscard: CardRef[];
  opponentDeckSize: number;
  opponentDiscard: CardRef[];
}) {
  const [open, setOpen] = useState<Browse>(null);
  const close = () => setOpen(null);
  return (
    <aside className="piles" aria-label={copy.decksAndDiscardPiles}>
      <div
        className={`pile f-${props.opponentFaction}`}
        role="img"
        aria-label={formatCopy(copy.opponentSDeckCards, { p0: props.opponentDeckSize })}
      >
        <span className="pile-stack">{props.opponentDeckSize}</span>
        {copy.opponentDeck}
      </div>
      <button
        type="button"
        className="pile"
        onClick={() => setOpen("opponentDiscard")}
        aria-label={formatCopy(copy.opponentSDiscardPileCards, {
          p0: props.opponentDiscard.length,
        })}
      >
        <span className="pile-stack">{props.opponentDiscard.length}</span>
        {copy.opponentDiscard}
      </button>
      <button
        type="button"
        className="pile"
        onClick={() => setOpen("yourDiscard")}
        aria-label={formatCopy(copy.yourDiscardPileCards, { p0: props.yourDiscard.length })}
      >
        <span className="pile-stack">{props.yourDiscard.length}</span>
        {copy.yourDiscard}
      </button>
      <button
        type="button"
        className={`pile f-${props.yourFaction}`}
        onClick={() => setOpen("yourDeck")}
        aria-label={formatCopy(copy.yourDeckCards, { p0: props.yourDeckSize })}
      >
        <span className="pile-stack">{props.yourDeckSize}</span>
        {copy.yourDeck}
      </button>

      {open === "yourDiscard" ? (
        <CardsOverlay title={copy.yourDiscardPile} cards={props.yourDiscard} onClose={close} />
      ) : null}
      {open === "opponentDiscard" ? (
        <CardsOverlay
          title={copy.opponentSDiscardPile}
          cards={props.opponentDiscard}
          onClose={close}
        />
      ) : null}
      {open === "yourDeck" ? (
        <Overlay
          title={formatCopy(copy.yourDeckCardsUnordered, { p0: props.yourDeckSize })}
          onClose={close}
        >
          <div className="overlay-cards">
            {props.yourDeck.length === 0 ? (
              <p className="overlay-empty">{copy.yourDeckIsEmpty}</p>
            ) : null}
            {props.yourDeck.map((entry) => (
              <Card
                key={entry.cardId}
                cardId={entry.cardId}
                size="tile"
                keyboardDetail
                count={entry.count}
              />
            ))}
          </div>
        </Overlay>
      ) : null}
    </aside>
  );
}

function CardsOverlay({
  title,
  cards,
  onClose,
}: {
  title: string;
  cards: CardRef[];
  onClose: () => void;
}) {
  return (
    <Overlay title={`${title} (${cards.length})`} onClose={onClose}>
      <div className="overlay-cards">
        {cards.length === 0 ? <p className="overlay-empty">{copy.noCards}</p> : null}
        {cards.map((c) => (
          <Card key={c.uid} cardId={c.cardId} size="tile" keyboardDetail />
        ))}
      </div>
    </Overlay>
  );
}
