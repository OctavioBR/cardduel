import { checkCompetitiveDeck, checkValidDeck } from "@card-duel/catalog";
import type { CardDefinition, UnitAbility } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Card } from "../cards/Card";
import { CardDetailProvider } from "../cards/CardDetail";
import { abilityLabel } from "../cards/icons";
import { cardDef, cardName, catalog } from "../cards/strings";
import { type Deck, deckApi } from "../decks/api";
import { countCopies, deckCounters, deckGroups, type PoolFilters, poolCards } from "../decks/pool";
import { type DropZone, useTileDrag } from "../decks/useTileDrag";
import copy from "../strings/en.json";

const ABILITIES: UnitAbility[] = [
  "agile",
  "horn",
  "medic",
  "moraleBoost",
  "muster",
  "tightBond",
  "scorch",
  "spy",
];
/** Changes save on their own this long after the last edit. */
const SAVE_DELAY_MS = 400;

type SaveState = "saved" | "saving" | "error";

export function DeckEditorPage() {
  const { id = "" } = useParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    deckApi.get(id).then(setDeck, (e: Error) => setError(e.message));
  }, [id]);
  if (error) return <main className="page">{error}</main>;
  if (!deck || !catalog) return <main className="page">{copy.loading}</main>;
  return (
    <CardDetailProvider>
      <Editor initial={deck} />
    </CardDetailProvider>
  );
}

function Editor({ initial }: { initial: Deck }) {
  const [name, setName] = useState(initial.name);
  const [leader, setLeader] = useState(initial.leader);
  const [cards, setCards] = useState(initial.cards);
  const [filters, setFilters] = useState<PoolFilters>({ row: "all", type: "all", ability: "all" });
  const [save, setSave] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Changes save automatically, debounced.
  useEffect(() => {
    if (!dirty.current) return;
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      deckApi.save(initial.id, { name, leader, cards }).then(
        () => setSave("saved"),
        () => setSave("error"),
      );
    }, SAVE_DELAY_MS);
  }, [name, leader, cards, initial.id]);
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      dirty.current = true;
      set(v);
    };

  const all = catalog?.cards ?? [];
  const leaders = all.filter((c) => c.kind === "leader" && c.faction === initial.faction);
  const copies = countCopies(cards);
  const pool = poolCards(all, initial.faction, filters);
  const deckInput = { faction: initial.faction, leader, cards };
  const problems = catalog
    ? {
        valid: checkValidDeck(deckInput, catalog),
        competitive: checkCompetitiveDeck(deckInput, catalog),
      }
    : null;
  const counters = deckCounters(cards, cardDef);
  const limits = catalog?.limits;

  const add = (def: CardDefinition) => {
    if ((copies.get(def.id) ?? 0) >= def.maxCopies) return;
    edit(setCards)([...cards, def.id]);
  };
  const remove = (cardId: string) => {
    const i = cards.lastIndexOf(cardId);
    if (i < 0) return;
    edit(setCards)([...cards.slice(0, i), ...cards.slice(i + 1)]);
  };
  const drag = useTileDrag((cardId, _from: DropZone, to: DropZone) => {
    const def = cardDef(cardId);
    if (!def) return;
    if (to === "deck") add(def);
    else remove(cardId);
  });

  return (
    <main className="page wide deck-editor">
      <div className="editor-head">
        <Link to="/decks">{copy.myDecks2}</Link>
        <label className="deck-name">
          <span className="visually-hidden">{copy.deckName}</span>
          <input
            value={name}
            maxLength={40}
            onChange={(e) => edit(setName)(e.target.value)}
            aria-label={copy.deckName}
          />
        </label>
        <span className={`faction-badge f-${initial.faction}`}>
          {initial.faction === "swarm" ? copy.swarm : copy.court}
        </span>
        <span className="save-state" role="status" data-testid="save-state">
          {save === "saving"
            ? copy.saving
            : save === "error"
              ? copy.notSavedCheckYourConnection
              : copy.saved}
        </span>
      </div>

      <div className="editor-columns">
        <section className="pool" aria-label={copy.cardPool} data-drop-zone="pool">
          <div className="filters">
            <label>
              {copy.row2}{" "}
              <select
                value={filters.row}
                onChange={(e) =>
                  setFilters({ ...filters, row: e.target.value as PoolFilters["row"] })
                }
              >
                <option value="all">{copy.all}</option>
                <option value="close">{copy.close}</option>
                <option value="ranged">{copy.ranged}</option>
                <option value="siege">{copy.siege}</option>
              </select>
            </label>
            <label>
              {copy.type}{" "}
              <select
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value as PoolFilters["type"] })
                }
              >
                <option value="all">{copy.all}</option>
                <option value="unit">{copy.units}</option>
                <option value="hero">{copy.heroes}</option>
                <option value="special">{copy.specialCards}</option>
              </select>
            </label>
            <label>
              {copy.ability}{" "}
              <select
                value={filters.ability}
                onChange={(e) =>
                  setFilters({ ...filters, ability: e.target.value as PoolFilters["ability"] })
                }
              >
                <option value="all">{copy.all}</option>
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {abilityLabel(a)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="tile-grid">
            {pool.map((def) => {
              const left = def.maxCopies - (copies.get(def.id) ?? 0);
              return (
                <button
                  key={def.id}
                  type="button"
                  className={`tile${left <= 0 ? " spent" : ""}`}
                  disabled={left <= 0}
                  aria-label={formatCopy(copy.addLeft, { p0: cardName(def.id), p1: left })}
                  data-testid="pool-tile"
                  data-card={def.id}
                  onPointerDown={left > 0 ? drag.start(def.id, "pool") : undefined}
                  onClick={() => !drag.ignoreClick() && add(def)}
                >
                  <Card cardId={def.id} size="tile" count={left} />
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="deck-panel"
          aria-label={copy.yourDeck2}
          data-drop-zone="deck"
          data-testid="deck-panel"
        >
          <fieldset className="leader-picker">
            <legend>{copy.leader3}</legend>
            {leaders.map((l) => (
              <label key={l.id} className={leader === l.id ? "chosen" : ""}>
                <input
                  type="radio"
                  name="leader"
                  checked={leader === l.id}
                  onChange={() => edit(setLeader)(l.id)}
                />
                {cardName(l.id)}
              </label>
            ))}
          </fieldset>

          <dl className="counters" data-testid="counters">
            <div className={limits && counters.units < limits.valid.minUnits ? "short" : ""}>
              <dt>{copy.units}</dt>
              <dd data-testid="count-units">
                {counters.units}
                {copy.label4}
                {limits?.valid.minUnits}
              </dd>
            </div>
            <div className={limits && counters.specials > limits.valid.maxSpecials ? "short" : ""}>
              <dt>{copy.specialCards}</dt>
              <dd data-testid="count-specials">
                {counters.specials}
                {copy.label4}
                {limits?.valid.maxSpecials}
              </dd>
            </div>
            <div>
              <dt>{copy.totalStrength}</dt>
              <dd data-testid="count-strength">{counters.strength}</dd>
            </div>
            <div>
              <dt>{copy.heroes}</dt>
              <dd>{counters.heroes}</dd>
            </div>
          </dl>

          <div className="deck-status" data-testid="deck-status">
            {problems?.valid.length === 0 ? (
              <p className="ok">
                {problems.competitive.length === 0 ? copy.competitiveDeck : copy.validDeck}
              </p>
            ) : null}
            {problems?.valid.map((p) => (
              <p key={`${p.code}-${p.cardId ?? ""}`} className="problem" data-testid="deck-error">
                {p.message}
              </p>
            ))}
            {problems?.competitive.map((p) => (
              <p key={`${p.code}-${p.cardId ?? ""}`} className="warning" data-testid="deck-warning">
                {copy.competitive}
                {p.message}
              </p>
            ))}
          </div>

          {deckGroups(cards, cardDef).map((group) => (
            <div key={group.key} className="deck-group">
              <h3>{group.label}</h3>
              <div className="tile-grid">
                {group.entries.map(({ def, count }) => (
                  <button
                    key={def.id}
                    type="button"
                    className="tile"
                    aria-label={formatCopy(copy.removeInDeck, { p0: cardName(def.id), p1: count })}
                    data-testid="deck-tile"
                    onPointerDown={drag.start(def.id, "deck")}
                    onClick={() => !drag.ignoreClick() && remove(def.id)}
                  >
                    <Card cardId={def.id} size="tile" count={count} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {cards.length === 0 ? <p className="muted">{copy.clickOrDragCardsFromThe}</p> : null}
        </section>
      </div>
      {drag.ghost ? (
        <div
          className="tile-ghost"
          style={{ left: drag.ghost.x, top: drag.ghost.y }}
          aria-hidden="true"
          data-testid="tile-ghost"
        >
          <Card cardId={drag.ghost.cardId} size="tile" />
        </div>
      ) : null}
    </main>
  );
}
