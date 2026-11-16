import { createBrowserRouter, type RouteObject } from "react-router";
import { HomePage } from "./pages/HomePage";

export const routes: RouteObject[] = [{ path: "/", element: <HomePage /> }];

export const router = createBrowserRouter(routes);
