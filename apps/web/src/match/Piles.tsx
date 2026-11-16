import type { CardRef, DeckCount, FactionId } from "@card-duel/engine";
import { useState } from "react";
import { Card } from "../cards/Card";
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
    <aside className="piles" aria-label="Decks and Discard Piles">
      <div
        className={`pile f-${props.opponentFaction}`}
        role="img"
        aria-label={`Opponent's deck, ${props.opponentDeckSize} cards`}
      >
        <span className="pile-stack">{props.opponentDeckSize}</span>
        Opponent deck
      </div>
      <button
        type="button"
        className="pile"
        onClick={() => setOpen("opponentDiscard")}
        aria-label={`Opponent's Discard Pile, ${props.opponentDiscard.length} cards`}
      >
        <span className="pile-stack">{props.opponentDiscard.length}</span>
        Opponent discard
      </button>
      <button
        type="button"
        className="pile"
        onClick={() => setOpen("yourDiscard")}
        aria-label={`Your Discard Pile, ${props.yourDiscard.length} cards`}
      >
        <span className="pile-stack">{props.yourDiscard.length}</span>
        Your discard
      </button>
      <button
        type="button"
        className={`pile f-${props.yourFaction}`}
        onClick={() => setOpen("yourDeck")}
        aria-label={`Your deck, ${props.yourDeckSize} cards`}
      >
        <span className="pile-stack">{props.yourDeckSize}</span>
        Your deck
      </button>

      {open === "yourDiscard" ? (
        <CardsOverlay title="Your Discard Pile" cards={props.yourDiscard} onClose={close} />
      ) : null}
      {open === "opponentDiscard" ? (
        <CardsOverlay
          title="Opponent's Discard Pile"
          cards={props.opponentDiscard}
          onClose={close}
        />
      ) : null}
      {open === "yourDeck" ? (
        <Overlay title={`Your deck (${props.yourDeckSize} cards, unordered)`} onClose={close}>
          <div className="overlay-cards">
            {props.yourDeck.length === 0 ? (
              <p className="overlay-empty">Your deck is empty.</p>
            ) : null}
            {props.yourDeck.map((entry) => (
              <Card key={entry.cardId} cardId={entry.cardId} size="tile" count={entry.count} />
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
        {cards.length === 0 ? <p className="overlay-empty">No cards.</p> : null}
        {cards.map((c) => (
          <Card key={c.uid} cardId={c.cardId} size="tile" />
        ))}
      </div>
    </Overlay>
  );
}
