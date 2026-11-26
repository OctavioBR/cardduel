import type { FactionId } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { FACTION_NAME, FACTIONS } from "../cards/factions";
import { type Deck, deckApi } from "../decks/api";
import copy from "../strings/en.json";

/** Your Decks, by Faction tab, with New Deck and Copy a Starter Deck. */
export function DecksPage() {
  const navigate = useNavigate();
  const [faction, setFaction] = useState<FactionId>("swarm");
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDecks(null);
    deckApi
      .list(faction)
      .then((d) => alive && setDecks(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [faction]);

  const open = async (make: () => Promise<Deck>) => {
    try {
      const deck = await make();
      navigate(`/decks/${deck.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="page wide">
      <h1>{copy.myDecks}</h1>
      <div className="decks-layout">
        <div className="tabs" role="tablist" aria-label={copy.faction}>
          {FACTIONS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={faction === f}
              className={`tab f-${f}`}
              onClick={() => setFaction(f)}
            >
              {FACTION_NAME[f]}
            </button>
          ))}
        </div>
        <div className="decks-main">
          <div className="deck-actions">
            <button
              type="button"
              className="primary"
              onClick={() => open(() => deckApi.create(faction, copy.newDeck))}
            >
              {copy.newDeck}
            </button>
            <button type="button" onClick={() => open(() => deckApi.copyStarter(faction))}>
              {copy.copyAStarterDeck}
            </button>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          {decks === null ? <p>{copy.loading}</p> : null}
          {decks?.length === 0 ? (
            <p className="muted">
              {copy.no}
              {FACTION_NAME[faction]}
              {copy.decksYet}
            </p>
          ) : null}
          <ul className="deck-list">
            {decks?.map((d) => (
              <li key={d.id}>
                <Link to={`/decks/${d.id}`}>{d.name}</Link>
                <span
                  className={
                    d.problems.valid.length === 0
                      ? d.problems.competitive.length === 0
                        ? "status competitive"
                        : "status valid"
                      : "status incomplete"
                  }
                >
                  {d.problems.valid.length === 0
                    ? d.problems.competitive.length === 0
                      ? copy.competitiveDeck
                      : copy.validDeck
                    : copy.incomplete}
                </span>
                <button
                  type="button"
                  className="link"
                  onClick={async () => {
                    await deckApi.remove(d.id);
                    setDecks((list) => list?.filter((x) => x.id !== d.id) ?? null);
                  }}
                  aria-label={formatCopy(copy.delete, { p0: d.name })}
                >
                  {copy.delete2}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
