import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HomePage } from "./HomePage";

it("shows the game name", () => {
  expect(renderToStaticMarkup(<HomePage />)).toContain("Card Duel");
});
