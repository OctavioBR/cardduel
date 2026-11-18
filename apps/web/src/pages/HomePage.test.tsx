import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { HomePage } from "./HomePage";

it("offers Find a Match, then a Room row to create one or join by code", () => {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <AuthProvider>
          <HomePage />
        </AuthProvider>
      ),
    },
  ]);
  const html = renderToStaticMarkup(<RouterProvider router={router} />);
  expect(html).toContain("Card Duel");
  expect(html.indexOf("Find a Match")).toBeLessThan(html.indexOf("Create Room"));
  expect(html.indexOf("Create Room")).toBeLessThan(html.indexOf("Room code"));
  // Nothing to play with until the Decks load.
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Find a Match</);
});
