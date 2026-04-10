// Vite config for the Electron renderer process (SPA build).
// Differences from the web build:
//  - No TanStack Start, no Nitro server
//  - Plain TanStack Router in hash-history SPA mode
//  - Module aliases swap server-dependent modules for Electron IPC wrappers
//  - Generates a separate route tree (routeTree.electron.gen.ts)

import { defineConfig } from "vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  root: ".",
  // Relative base so asset URLs work under file:// protocol in Electron
  base: "./",

  define: {
    // Used by routes/components to detect the Electron build at compile time.
    // Dead code elimination removes web-only branches in the Electron bundle.
    "import.meta.env.VITE_PLATFORM": JSON.stringify("electron"),
  },

  resolve: {
    alias: {
      // Swap server-side API modules for Electron IPC wrappers
      "@/api/chains": path.resolve("src/electron-api/chains.ts"),
      "@/api/jumpdocs": path.resolve("src/electron-api/jumpdocs.ts"),
      "@/api/images": path.resolve("src/electron-api/images.ts"),
      // Swap auth and settings for Electron stubs
      "@/app/state/auth": path.resolve("src/electron-api/auth.tsx"),
      "@/app/state/localSettings": path.resolve("src/electron-api/localSettings.ts"),
      "@/app/state/recentChains": path.resolve("src/electron-api/recentChains.ts"),
      "@/api/auth": path.resolve("src/electron-api/api-auth.ts"),
      "@/api/purchases": path.resolve("src/electron-api/purchases.ts"),
      // Stub out Node/server modules that leak into the renderer via transitive deps
      "util": path.resolve("src/electron-api/empty.ts"),
      "node:async_hooks": path.resolve("src/electron-api/empty.ts"),
      "gcp-metadata": path.resolve("src/electron-api/empty.ts"),
      "node-fetch": path.resolve("src/electron-api/empty.ts"),
      "@tanstack/start-client-core": path.resolve("src/electron-api/empty.ts"),
      "@tanstack/start-storage-context": path.resolve("src/electron-api/empty.ts"),
    },
  },

  plugins: [
    // In dev mode, vite serve defaults to index.html. Rewrite root requests to
    // index.electron.html so the Electron renderer gets the correct entry point.
    {
      name: "electron-html-entry",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/" || req.url === "/index.html") {
            req.url = "/index.electron.html";
          }
          next();
        });
      },
    },
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.electron.gen.ts",
      // Exclude routes that depend heavily on the server environment
      routeFileIgnorePattern: "portal\\.tsx|userimages\\.tsx",
    }),
    viteReact(),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    visualizer({
      filename: "dist-electron-renderer/stats.html", // output file
      open: true, // we will open manually
      gzipSize: true,
      brotliSize: true,
    }),
  ],

  build: {
    outDir: "dist-electron-renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve("index.electron.html"),
      },
    },
  },

  server: {
    port: 5174,
    strictPort: true,
  },
  worker: {
    format: "es",
  },
});
