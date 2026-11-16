import { createBrowserRouter, type RouteObject } from "react-router";
import { HomePage } from "./pages/HomePage";

export const routes: RouteObject[] = [{ path: "/", element: <HomePage /> }];

// Development-only routes. `import.meta.env.DEV` is statically false in production builds,
// so these modules (and the in-browser engine they use) are dropped from the bundle.
if (import.meta.env.DEV) {
  routes.push({
    path: "/dev/local",
    lazy: async () => ({ Component: (await import("./dev/LocalRoomPage")).LocalRoomPage }),
  });
}

export const router = createBrowserRouter(routes);
