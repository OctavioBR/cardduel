import type { CardDefinition } from "@card-duel/engine";
import { Card, type CardSize } from "../cards/Card";
import { catalog } from "../cards/strings";

const SIZES: CardSize[] = ["token", "hand", "tile", "detail"];

/** Every catalog card at every size, with raised and lowered Strength. Development only. */
export function CardGalleryPage() {
  const cards: CardDefinition[] = catalog?.cards ?? [];
  return (
    <main className="gallery">
      <h1>
        Card gallery ({catalog?.version ?? "no catalog"}, {cards.length} cards)
      </h1>
      {cards.map((def) => (
        <section
          key={def.id}
          className="gallery-row"
          aria-label={def.id}
          data-testid="gallery-card"
        >
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
        </section>
      ))}
    </main>
  );
}
