// Electron renderer entry point.
// Uses TanStack Router in SPA mode with hash history (required for file:// protocol).
// No TanStack Start / Nitro — this is a plain client-side SPA.

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";

import { routeTree } from "./routeTree.electron.gen";

const hashHistory = createHashHistory();

const router = createRouter({
  routeTree,
  history: hashHistory,
});

const root = document.getElementById("root");
if (!root) throw new Error("No #root element found");

ReactDOM.createRoot(root).render(
    <RouterProvider router={router} />
);
