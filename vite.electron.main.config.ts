// Vite config for building the Electron main process and preload script.
// Output: dist-electron/main.js and dist-electron/preload.js

import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import path from "path";
import visualizer from "rollup-plugin-visualizer";

export default defineConfig({
  build: {
    outDir: "dist-electron",
    target: "node20",
    lib: {
      entry: {
        main: path.resolve("electron/main.ts"),
        preload: path.resolve("electron/preload.ts"),
      },
      formats: ["cjs"],
    },
    rollupOptions: {
      external: [
        "electron",
        "fs",
        "os",
        "path",
        "crypto",
        "zlib",
        "buffer",
        "stream",
        "events",
        "util",
        "sharp",
        "electron-context-menu",
        "electron-updater",
      ],
      output: {
        entryFileNames: "[name].cjs",
      },
    },
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@": path.resolve("src"),
    },
  },
  plugins: [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    // visualizer({
    //   filename: "dist-electron-renderer/statsII.html", // output file
    //   open: true
    // }),
  ],
  worker: {
    format: "es",
  },
});
