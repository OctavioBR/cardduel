import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { HomePage } from "./HomePage";

it("offers to create a Room and to join one by code", () => {
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
  expect(html).toContain("Create Room");
  expect(html).toContain("Room code");
});
