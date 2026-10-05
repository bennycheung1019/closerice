import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: "/closerice/",
  publicDir: path.resolve(root, "../public"),
  plugins: [react()],
  build: {
    outDir: path.resolve(root, "../dist-pages"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(root, "index.html"),
        ai: path.resolve(root, "ai/index.html"),
      },
    },
  },
});
