import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { HomePage } from "./routes/HomePage.tsx";
import { JoinPage } from "./routes/JoinPage.tsx";
import { RoomPage } from "./routes/RoomPage.tsx";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

export const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join",
  validateSearch: (search: Record<string, unknown>): { code?: string } => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: JoinPage,
});

export const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/r/$roomId",
  component: RoomPage,
});

const routeTree = rootRoute.addChildren([homeRoute, joinRoute, roomRoute]);

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
