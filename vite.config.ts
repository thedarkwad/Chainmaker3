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
    minify: "esbuild",
    rollupOptions: {
      // chart.js is an optional peer dep of primereact — not installed, skip it
      external: ["chart.js/auto"],
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-pdf": ["@react-pdf/renderer", "pdfjs-dist"],
          "vendor-firebase": ["firebase/app", "firebase/auth"],
          "vendor-tanstack": ["@tanstack/react-router", "@tanstack/react-start"],
          "vendor-ui": ["primereact", "react-toastify", "sweetalert2", "sweetalert2-react-content"],
        },
      },
    },
  },
  worker: {
    format: "es",
  },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: {
        external: [
          "firebase-admin",
          "firebase-admin/app",
          "firebase-admin/auth",
          "node-forge",
          // Native / large server-side deps — do not bundle, require at runtime
          "sharp",
          "mongoose",
          "@aws-sdk/client-s3",
          "compress-pdf",
          "adm-zip",
        ],
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
