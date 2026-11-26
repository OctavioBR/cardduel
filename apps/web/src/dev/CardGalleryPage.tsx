import type { CardDefinition } from "@card-duel/engine";
import { Card, type CardSize } from "../cards/Card";
import { CardDetailProvider } from "../cards/CardDetail";
import { FACTION_NAME, FACTIONS } from "../cards/factions";
import { catalog } from "../cards/strings";

const SIZES: CardSize[] = ["token", "hand", "tile", "detail"];

function GalleryCardRow({ def }: { def: CardDefinition }) {
  return (
    <section className="gallery-row" aria-label={def.id} data-testid="gallery-card">
      {SIZES.map((size) => (
        <Card key={size} cardId={def.id} size={size} />
      ))}
      {def.kind === "unit" && !def.hero ? (
        <>
          <Card cardId={def.id} size="token" strength={def.strength + 3} />
          <Card cardId={def.id} size="token" strength={1} />
        </>
      ) : null}
      <Card cardId={def.id} size="tile" count={def.maxCopies} />
      {def.kind === "unit" &&
        def.alternateImages?.map((image, i) => (
          <Card key={image} cardId={def.id} size="tile" artIndex={i + 1} />
        ))}
    </section>
  );
}

/** Every catalog card at every size, with raised and lowered Strength. Development only. */
export function CardGalleryPage() {
  const cards = catalog?.cards ?? [];
  const groups = [...FACTIONS, "neutral" as const]
    .map((faction) => ({
      id: `gallery-${faction}`,
      label: faction === "neutral" ? "Neutral Cards" : FACTION_NAME[faction],
      cards: cards.filter((card) => card.faction === faction),
    }))
    .filter((group) => group.cards.length > 0);

  return (
    <CardDetailProvider>
      <main className="gallery">
        <h1>
          Card gallery ({catalog?.version ?? "no catalog"}, {cards.length} cards)
        </h1>
        <div className="gallery-layout">
          {groups.length > 0 ? (
            <nav className="gallery-nav" aria-label="Jump to cards">
              {groups.map(({ id, label }) => (
                <a key={id} href={`#${id}`}>
                  {label}
                </a>
              ))}
            </nav>
          ) : null}
          <div className="gallery-groups">
            {groups.map(({ id, label, cards }) => (
              <section key={id} aria-labelledby={id}>
                <h2 id={id} tabIndex={-1}>
                  {label}
                </h2>
                {cards.map((def) => (
                  <GalleryCardRow key={def.id} def={def} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </main>
    </CardDetailProvider>
  );
}
