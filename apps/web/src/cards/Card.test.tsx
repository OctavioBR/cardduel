import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Card, type CardSize } from "./Card";
import { cardName, catalog } from "./strings";

const SIZES: CardSize[] = ["token", "hand", "tile", "detail"];
const cards = catalog?.cards ?? [];

describe("Card", () => {
  it("renders every catalog card at every size", () => {
    expect(cards.length).toBeGreaterThan(50);
    for (const def of cards) {
      for (const size of SIZES) {
        const html = renderToStaticMarkup(<Card cardId={def.id} size={size} />);
        expect(html).toContain(`cd-${size}`);
        expect(html).toContain(`cd-f-${def.faction}`);
        if (size !== "token") expect(html).toContain(cardName(def.id).replaceAll("'", "&#x27;"));
        if (def.kind === "unit") expect(html).toContain(`>${def.strength}<`);
      }
    }
  });

  it("the board token shows only Strength and icons", () => {
    const html = renderToStaticMarkup(<Card cardId="swarm-hive-drone" size="token" />);
    expect(html).not.toContain("cd-name");
    expect(html).not.toContain("cd-art");
    expect(html).toContain('aria-label="Muster"');
  });

  it("colours current Strength against printed Strength", () => {
    expect(
      renderToStaticMarkup(<Card cardId="swarm-hive-drone" size="token" strength={5} />),
    ).toContain("cd-raised");
    expect(
      renderToStaticMarkup(<Card cardId="swarm-hive-drone" size="token" strength={1} />),
    ).toContain("cd-lowered");
    expect(
      renderToStaticMarkup(<Card cardId="swarm-hive-drone" size="token" strength={2} />),
    ).not.toMatch(/cd-raised|cd-lowered/);
  });

  it("marks Heroes, both Rows for Agile, and Special Cards by effect", () => {
    expect(renderToStaticMarkup(<Card cardId="swarm-hollow-colossus" size="hand" />)).toContain(
      "cd-hero",
    );
    const agile = renderToStaticMarkup(<Card cardId="swarm-skitterling" size="hand" />);
    expect(agile).toContain('aria-label="Close"');
    expect(agile).toContain('aria-label="Ranged"');
    expect(renderToStaticMarkup(<Card cardId="neutral-black-ice" size="hand" />)).toContain(
      'aria-label="Weather"',
    );
  });

  it("shows the Rows a Weather card affects", () => {
    const html = renderToStaticMarkup(<Card cardId="neutral-thunderhead" size="hand" />);
    expect(html).toContain('aria-label="Ranged"');
    expect(html).toContain('aria-label="Siege"');
    expect(html).toContain('aria-label="Thunderhead, Ranged and Siege"');
  });

  it("describes the card for assistive technology", () => {
    const html = renderToStaticMarkup(<Card cardId="swarm-hive-drone" size="token" strength={3} />);
    expect(html).toContain('aria-label="Hive Drone, Strength 3, Ranged, Muster"');
  });

  it("shows a copies badge in the Deck builder", () => {
    expect(
      renderToStaticMarkup(<Card cardId="swarm-hive-drone" size="tile" count={2} />),
    ).toContain("×2");
  });
});
