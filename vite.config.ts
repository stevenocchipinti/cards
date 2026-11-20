import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages at https://stevenocchipinti.github.io/cards/
export default defineConfig({
  base: "/cards/",
  plugins: [react()],
  server: { host: true },
});
