import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const config = defineConfig({
  build: {
    ssr: false,
  },
  worker: {
    format: "es",
  },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: {
        external: ["firebase-admin", "firebase-admin/app", "firebase-admin/auth", "node-forge"],
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),

    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
