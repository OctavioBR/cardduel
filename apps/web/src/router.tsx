import { createBrowserRouter, type RouteObject } from "react-router";
import { AppShell } from "./app/AppShell";
import { RequireAuth } from "./auth/RequireAuth";
import { AuthPage } from "./pages/AuthPage";
import { DeckEditorPage } from "./pages/DeckEditorPage";
import { DecksPage } from "./pages/DecksPage";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        path: "/",
        element: (
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        ),
      },
      { path: "/signin", element: <AuthPage mode="signin" /> },
      { path: "/signup", element: <AuthPage mode="signup" /> },
      {
        path: "/decks",
        element: (
          <RequireAuth>
            <DecksPage />
          </RequireAuth>
        ),
      },
      {
        path: "/decks/:id",
        element: (
          <RequireAuth>
            <DeckEditorPage />
          </RequireAuth>
        ),
      },
    ],
  },
  {
    path: "/r/:code",
    element: (
      <RequireAuth>
        <RoomPage />
      </RequireAuth>
    ),
  },
];

// Development-only routes. `import.meta.env.DEV` is statically false in production builds,
// so these modules (and the in-browser engine they use) are dropped from the bundle.
if (import.meta.env.DEV) {
  routes.push({
    path: "/dev/local",
    lazy: async () => ({ Component: (await import("./dev/LocalRoomPage")).LocalRoomPage }),
  });
  routes.push({
    path: "/dev/cards",
    lazy: async () => ({ Component: (await import("./dev/CardGalleryPage")).CardGalleryPage }),
  });
}

export const router = createBrowserRouter(routes);
